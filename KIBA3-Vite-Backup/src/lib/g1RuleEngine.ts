import type { 
  G1Context, 
  G1Result, 
  ProcurementContext, 
  ApproverRole, 
  ChecklistItem,
  CartDecision,
  Vendor,
  LineItem
} from '../types';

/**
 * Decision Gate G1 Rule Engine
 * Evaluates pricing completeness, business rules, and document sufficiency
 * to determine if procurement can proceed directly to approvals or needs RFQ generation
 */

export class G1RuleEngine {
  private static readonly PRICING_THRESHOLDS = {
    CC_PMO_THRESHOLD: 5000,
    CC_FINANCE_THRESHOLD: 5000,
    PROC_PRESIDENT_THRESHOLD: 250000,
    ROMS_FINANCE_THRESHOLD: 250000,
    ROMS_PRESIDENT_THRESHOLD: 500000,
    SSJ_CONTRACTS_THRESHOLD: 250000
  };

  /**
   * Main G1 evaluation function
   */
  static evaluate(context: G1Context): G1Result {
    const { selectedVendors, items, pricing, procurementContext } = context;
    
    const reasonCodes: string[] = [];
    const missingItems: string[] = [];
    const recommendations: string[] = [];
    const requiredApprovers: ApproverRole[] = [];

    // 1. Pricing Completeness Check
    const pricingCheck = this.checkPricingCompleteness(selectedVendors, items, pricing);
    if (!pricingCheck.pass) {
      reasonCodes.push(...pricingCheck.reasonCodes);
      missingItems.push(...pricingCheck.missingItems);
    }

    // 2. Document Sufficiency Check
    const docCheck = this.checkDocumentSufficiency(selectedVendors, items);
    if (!docCheck.pass) {
      reasonCodes.push(...docCheck.reasonCodes);
      missingItems.push(...docCheck.missingItems);
    }

    // 3. Business Rules Check
    const businessCheck = this.checkBusinessRules(procurementContext);
    if (!businessCheck.pass) {
      reasonCodes.push(...businessCheck.reasonCodes);
      recommendations.push(...businessCheck.recommendations);
    }

    // 4. Determine Required Approvers
    const approvers = this.resolveApprovers(procurementContext);
    requiredApprovers.push(...approvers.required);

    // 5. Final Decision
    const pass = reasonCodes.length === 0 && missingItems.length === 0;
    
    if (!pass) {
      recommendations.push('Consider generating RFQs to gather missing information');
    }

    return {
      pass,
      reasonCodes,
      missingItems,
      recommendations,
      requiredApprovers
    };
  }

  /**
   * Generate cart decision with checklist
   */
  static generateCartDecision(context: G1Context): CartDecision {
    const g1Result = this.evaluate(context);
    const checklist = this.generateChecklist(context, g1Result);
    const readinessPercentage = this.calculateReadinessPercentage(checklist);
    
    const recommendation = g1Result.pass 
      ? 'PROCEED_TO_APPROVALS' 
      : 'GENERATE_RFQS';
    
    const reason = g1Result.pass 
      ? 'All requirements met for direct procurement approval'
      : `Missing items: ${g1Result.missingItems.join(', ')}`;

    return {
      recommendation,
      reason,
      g1Result,
      readinessPercentage,
      checklist
    };
  }

  /**
   * Check pricing completeness for all selected vendors
   */
  private static checkPricingCompleteness(
    vendors: Vendor[], 
    items: LineItem[], 
    pricing: Record<string, LineItem[]>
  ): { pass: boolean; reasonCodes: string[]; missingItems: string[] } {
    const reasonCodes: string[] = [];
    const missingItems: string[] = [];

    for (const vendor of vendors) {
      const vendorPricing = pricing[vendor.id] || [];
      
      // Check if vendor has pricing for all items
      if (vendorPricing.length === 0) {
        reasonCodes.push('MISSING_PRICE');
        missingItems.push(`No pricing available for ${vendor.name}`);
        continue;
      }

      // Check each item has complete pricing
      for (const item of items) {
        const vendorItem = vendorPricing.find(p => p.sku === item.sku);
        if (!vendorItem) {
          reasonCodes.push('MISSING_PRICE');
          missingItems.push(`Missing price for ${item.desc} from ${vendor.name}`);
          continue;
        }

        // Check required pricing fields
        if (!vendorItem.unitPrice || vendorItem.unitPrice <= 0) {
          reasonCodes.push('INVALID_PRICE');
          missingItems.push(`Invalid unit price for ${item.desc} from ${vendor.name}`);
        }

        if (!vendorItem.currency) {
          reasonCodes.push('MISSING_CURRENCY');
          missingItems.push(`Missing currency for ${item.desc} from ${vendor.name}`);
        }

        if (!vendorItem.leadDays || vendorItem.leadDays <= 0) {
          reasonCodes.push('MISSING_LEAD_TIME');
          missingItems.push(`Missing lead time for ${item.desc} from ${vendor.name}`);
        }

        if (!vendorItem.deliveryTerms) {
          reasonCodes.push('MISSING_DELIVERY_TERMS');
          missingItems.push(`Missing delivery terms for ${item.desc} from ${vendor.name}`);
        }

        if (!vendorItem.quoteValidity) {
          reasonCodes.push('MISSING_QUOTE_VALIDITY');
          missingItems.push(`Missing quote validity for ${item.desc} from ${vendor.name}`);
        }
      }
    }

    return {
      pass: reasonCodes.length === 0,
      reasonCodes,
      missingItems
    };
  }

  /**
   * Check document sufficiency
   */
  private static checkDocumentSufficiency(
    vendors: Vendor[], 
    items: LineItem[]
  ): { pass: boolean; reasonCodes: string[]; missingItems: string[] } {
    const reasonCodes: string[] = [];
    const missingItems: string[] = [];

    // Check for quote evidence
    const hasQuoteEvidence = vendors.some(v => v.contact && v.website);
    if (!hasQuoteEvidence) {
      reasonCodes.push('INSUFFICIENT_EVIDENCE');
      missingItems.push('No quote evidence or vendor contact information');
    }

    // Check for specification documents
    const hasSpecs = items.some(item => item.desc && item.desc.length > 10);
    if (!hasSpecs) {
      reasonCodes.push('INSUFFICIENT_SPECS');
      missingItems.push('Insufficient product specifications');
    }

    return {
      pass: reasonCodes.length === 0,
      reasonCodes,
      missingItems
    };
  }

  /**
   * Check business rules compliance
   */
  private static checkBusinessRules(
    context: ProcurementContext
  ): { pass: boolean; reasonCodes: string[]; recommendations: string[] } {
    const reasonCodes: string[] = [];
    const recommendations: string[] = [];

    // Check sole source justification
    if (context.isSoleSource && !context.ssjAmount) {
      reasonCodes.push('SOLE_SOURCE_JUST_REQUIRED');
      recommendations.push('Sole source justification required for non-competitive procurement');
    }

    // Check contract requirements
    if (context.contractRequired && !context.contractExecuted) {
      reasonCodes.push('CONTRACT_REQUIRED');
      recommendations.push('Contract execution required before proceeding');
    }

    // Check budget status
    if (!context.budgeted && context.spendPlanStatus === 'NOT_IN_PLAN') {
      reasonCodes.push('UNBUDGETED_PROCUREMENT');
      recommendations.push('Unbudgeted procurement requires additional approvals');
    }

    return {
      pass: reasonCodes.length === 0,
      reasonCodes,
      recommendations
    };
  }

  /**
   * Resolve required approvers based on KMI matrix rules
   */
  private static resolveApprovers(context: ProcurementContext): { required: ApproverRole[]; reasons: string[] } {
    const required = new Set<ApproverRole>();
    const reasons: string[] = [];

    const add = (role: ApproverRole, why: string) => {
      required.add(role);
      reasons.push(`${role}: ${why}`);
    };

    switch (context.procurementType) {
      case 'CC_APPROVED_SPEND_PLAN':
        return { required: [], reasons: ['Approved spend plan – CC purchase'] };

      case 'CC_NOT_IN_SPEND_PLAN':
        if (context.estimatedCost > this.PRICING_THRESHOLDS.CC_PMO_THRESHOLD) {
          add('PMO', 'CC > $5k');
          add('Finance', 'CC > $5k');
        }
        break;

      case 'PROC_COMPETITIVE':
        add('PMO', 'Competitive procurement');
        add('EVP', 'Policy');
        add('Finance', 'Policy');
        if (context.contractExecuted) add('Contracts', 'Executed by a contract');
        if (context.estimatedCost > this.PRICING_THRESHOLDS.PROC_PRESIDENT_THRESHOLD) {
          add('President', '> $250k');
        }
        break;

      case 'PROC_SOLE_SOURCE':
        add('PMO', 'Sole source');
        add('EVP', 'Policy');
        add('Finance', 'Policy');
        if (context.contractExecuted || (context.ssjAmount && context.ssjAmount > this.PRICING_THRESHOLDS.SSJ_CONTRACTS_THRESHOLD)) {
          add('Contracts', 'Contract/SSJ > $250k');
        }
        if (context.estimatedCost > this.PRICING_THRESHOLDS.PROC_PRESIDENT_THRESHOLD) {
          add('President', '> $250k');
        }
        break;

      case 'BIDS_AND_PROPOSALS':
        add('PMO', 'B&P baseline');
        add('EVP', 'B&P baseline');
        add('Finance', 'B&P baseline');
        if (context.popGt30d || context.subcontracting || 
            (context.ssjAmount && context.ssjAmount > this.PRICING_THRESHOLDS.SSJ_CONTRACTS_THRESHOLD) || 
            context.customerTCs) {
          // Additional conditions already covered above
        }
        if (context.estimatedCost > this.PRICING_THRESHOLDS.PROC_PRESIDENT_THRESHOLD) {
          add('President', '> $250k');
        }
        break;

      case 'ROMS':
        add('PMO', 'ROMS');
        add('EVP', 'ROMS');
        if (context.estimatedCost > this.PRICING_THRESHOLDS.ROMS_FINANCE_THRESHOLD) {
          add('Finance', 'ROMS > $250k');
        }
        if (context.estimatedCost > this.PRICING_THRESHOLDS.ROMS_PRESIDENT_THRESHOLD) {
          add('President', 'ROMS > $500k');
        }
        break;
    }

    return { required: Array.from(required), reasons };
  }

  /**
   * Generate checklist items for UI display
   */
  private static generateChecklist(context: G1Context, g1Result: G1Result): ChecklistItem[] {
    const checklist: ChecklistItem[] = [];

    // Pricing completeness
    const pricingComplete = !g1Result.reasonCodes.some(code => 
      ['MISSING_PRICE', 'INVALID_PRICE', 'MISSING_CURRENCY', 'MISSING_LEAD_TIME', 'MISSING_DELIVERY_TERMS', 'MISSING_QUOTE_VALIDITY'].includes(code)
    );
    checklist.push({
      id: 'pricing',
      label: 'Complete pricing for all vendors',
      status: pricingComplete ? 'PASS' : 'FAIL',
      message: pricingComplete ? 'All vendors have complete pricing' : 'Missing pricing information',
      required: true
    });

    // Document sufficiency
    const docsSufficient = !g1Result.reasonCodes.some(code => 
      ['INSUFFICIENT_EVIDENCE', 'INSUFFICIENT_SPECS'].includes(code)
    );
    checklist.push({
      id: 'documents',
      label: 'Sufficient supporting documents',
      status: docsSufficient ? 'PASS' : 'FAIL',
      message: docsSufficient ? 'All required documents available' : 'Missing supporting documents',
      required: true
    });

    // Business rules
    const businessRulesPass = !g1Result.reasonCodes.some(code => 
      ['SOLE_SOURCE_JUST_REQUIRED', 'CONTRACT_REQUIRED', 'UNBUDGETED_PROCUREMENT'].includes(code)
    );
    checklist.push({
      id: 'business_rules',
      label: 'Business rules compliance',
      status: businessRulesPass ? 'PASS' : 'FAIL',
      message: businessRulesPass ? 'All business rules satisfied' : 'Business rule violations detected',
      required: true
    });

    // Approver resolution
    const approversResolved = g1Result.requiredApprovers.length > 0;
    checklist.push({
      id: 'approvers',
      label: 'Approver roster resolved',
      status: approversResolved ? 'PASS' : 'WARNING',
      message: approversResolved ? `${g1Result.requiredApprovers.length} approvers identified` : 'Approver resolution pending',
      required: true
    });

    return checklist;
  }

  /**
   * Calculate readiness percentage based on checklist
   */
  private static calculateReadinessPercentage(checklist: ChecklistItem[]): number {
    const requiredItems = checklist.filter(item => item.required);
    const passedItems = requiredItems.filter(item => item.status === 'PASS');
    return requiredItems.length > 0 ? (passedItems.length / requiredItems.length) * 100 : 0;
  }
}
