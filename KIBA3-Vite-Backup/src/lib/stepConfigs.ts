/**
 * Step Configurations for Production-Ready Flow
 */

import type { StepConfig } from './stepManager';

export const STEP_CONFIGS: StepConfig[] = [
  {
    id: 1,
    key: 'projectContext',
    label: 'Project Context',
    title: 'Project Context',
    component: 'StepProjectContext',
    required: true,
    dependencies: [],
    validation: (state, data) => {
      // Check both state and data for required fields
      const procurementType = data?.procurementType || state.procurementType;
      const serviceProgram = data?.serviceProgram || state.serviceProgram;
      const technicalPOC = data?.technicalPOC || state.technicalPOC;
      const selectedProject = data?.selectedProject || state.selectedProject;
      
      console.log('Step 1 validation - data:', data);
      console.log('Step 1 validation - state:', state);
      
      if (!procurementType?.trim()) {
        return { isValid: false, error: 'Procurement type is required' };
      }
      if (!serviceProgram?.trim()) {
        return { isValid: false, error: 'Service program is required' };
      }
      if (!technicalPOC?.trim()) {
        return { isValid: false, error: 'Technical POC is required' };
      }
      if (!selectedProject?.trim()) {
        return { isValid: false, error: 'Project selection is required' };
      }
      
      return { isValid: true };
    }
  },
  {
    id: 2,
    key: 'productDetails',
    label: 'Product Details',
    title: 'Product Details',
    component: 'StepProductDetails',
    required: true,
    dependencies: [1],
    validation: (state, data) => {
      console.log('=== STEP 2 VALIDATION DEBUG ===');
      console.log('Raw data parameter:', data);
      console.log('Raw state parameter:', state);
      console.log('Data type:', typeof data);
      console.log('State type:', typeof state);
      
      // Check both state and data for required fields
      const productName = data?.productName || state.productName;
      const quantity = data?.quantity || state.quantity;
      const budget = data?.budget || state.budget;
      const projectScope = data?.projectScope || state.projectScope;
      
      console.log('Extracted productName:', productName);
      console.log('Extracted quantity:', quantity);
      console.log('Extracted budget:', budget);
      console.log('Extracted projectScope:', projectScope);
      console.log('ProductName truthy check:', !!productName);
      console.log('ProductName trim check:', productName?.trim());
      console.log('ProductName length:', productName?.length);
      
      if (!productName?.trim()) {
        console.log('❌ VALIDATION FAILED: Product name is required');
        return { isValid: false, error: 'Product name is required' };
      }
      if (!quantity || parseInt(quantity) <= 0) {
        console.log('❌ VALIDATION FAILED: Valid quantity is required');
        return { isValid: false, error: 'Valid quantity is required' };
      }
      if (!budget || parseFloat(budget) <= 0) {
        console.log('❌ VALIDATION FAILED: Valid budget is required');
        return { isValid: false, error: 'Valid budget is required' };
      }
      if (!projectScope?.trim()) {
        console.log('❌ VALIDATION FAILED: Project scope is required');
        return { isValid: false, error: 'Project scope is required' };
      }
      
      console.log('✅ STEP 2 VALIDATION PASSED');
      return { isValid: true };
    },
    onExit: async (state) => {
      // Start KPA One-Flow intake process
      console.log('Step 2: Starting intake process...');
      // This will be handled by the component
    }
  },
  {
    id: 3,
    key: 'aiFollowup',
    label: 'AI Follow-up Questions',
    title: 'AI Follow-up Questions',
    component: 'StepSpecifications',
    required: true,
    dependencies: [2],
    validation: (state) => {
      console.log('Step 3 validation - state:', state);
      
      // For now, always allow progression to step 3 for testing
      // The actual validation will be handled in the StepSpecifications component
      console.log('Step 3 validation - allowing progression for testing');
      return { isValid: true };
    }
  },
  {
    id: 4,
    key: 'projectSummary',
    label: 'Project Summary',
    title: 'Project Summary',
    component: 'StepProjectSummary',
    required: true,
    dependencies: [3],
    validation: (state) => {
      // Project summary step is always valid once reached
      return { isValid: true };
    }
  },
  {
    id: 5,
    key: 'aiRecommendations',
    label: 'AI Recommendations',
    title: 'AI Recommendations',
    component: 'StepSpecifications',
    required: true,
    dependencies: [4],
    validation: (state) => {
      const { kpaRecommendations, selectedVariants } = state;
      
      if (!kpaRecommendations && (!selectedVariants || selectedVariants.length === 0)) {
        return { isValid: false, error: 'No recommendations available' };
      }
      
      return { isValid: true };
    }
  },
  {
    id: 6,
    key: 'vendorSearch',
    label: 'Vendor Search',
    title: 'Vendor Search',
    component: 'StepVendorSearch',
    required: true,
    dependencies: [5],
    validation: (state, data) => {
      console.log('=== STEP 6 VALIDATION DEBUG ===');
      console.log('Raw data parameter:', data);
      console.log('Raw state parameter:', state);
      console.log('Data selectedVendors:', data?.selectedVendors);
      console.log('State selectedVendors:', state.selectedVendors);
      
      // Check both state and data for selectedVendors
      const selectedVendors = data?.selectedVendors || state.selectedVendors;
      
      console.log('Final selectedVendors:', selectedVendors);
      console.log('SelectedVendors length:', selectedVendors?.length);
      console.log('SelectedVendors truthy check:', !!selectedVendors);
      
      if (!selectedVendors || selectedVendors.length === 0) {
        console.log('❌ STEP 6 VALIDATION FAILED: No vendors selected');
        return { isValid: false, error: 'Please select at least one vendor to continue' };
      }
      
      console.log('✅ STEP 6 VALIDATION PASSED');
      return { isValid: true };
    }
  },
  {
    id: 7,
    key: 'cart',
    label: 'CART',
    title: 'CART',
    component: 'StepRFQProcurement',
    required: true,
    dependencies: [6],
    validation: (state, data) => {
      console.log('=== STEP 7 (CART) VALIDATION DEBUG ===');
      console.log('Raw data parameter:', data);
      console.log('Raw state parameter:', state);
      console.log('Data selectedVendors:', data?.selectedVendors);
      console.log('State selectedVendors:', state.selectedVendors);
      console.log('All state keys:', Object.keys(state));
      
      // Check both state and data for selectedVendors
      const selectedVendors = data?.selectedVendors || state.selectedVendors;
      
      console.log('Final selectedVendors:', selectedVendors);
      console.log('SelectedVendors length:', selectedVendors?.length);
      
      if (!selectedVendors || selectedVendors.length === 0) {
        console.log('❌ STEP 7 VALIDATION FAILED: No vendors selected');
        return { isValid: false, error: 'Please select at least one vendor for CART' };
      }
      
      console.log('✅ STEP 7 VALIDATION PASSED');
      return { isValid: true };
    }
  },

];

export const STEP_KEYS = {
  PROJECT_CONTEXT: 'projectContext',
  PRODUCT_DETAILS: 'productDetails',
  AI_FOLLOWUP: 'aiFollowup',
  PROJECT_SUMMARY: 'projectSummary',
  AI_RECOMMENDATIONS: 'aiRecommendations',
  VENDOR_SEARCH: 'vendorSearch',
  RFQ_GENERATION: 'rfqGeneration'
} as const;

export const getStepByKey = (key: string): StepConfig | undefined => {
  return STEP_CONFIGS.find(step => step.key === key);
};

export const getStepById = (id: number): StepConfig | undefined => {
  return STEP_CONFIGS.find(step => step.id === id);
};
