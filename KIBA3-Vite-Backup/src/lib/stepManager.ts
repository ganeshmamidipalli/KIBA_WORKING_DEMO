/**
 * Production-Ready Step Management System
 * Handles step navigation, validation, and state management
 */

export interface StepConfig {
  id: number;
  key: string;
  label: string;
  title: string;
  component: string;
  required: boolean;
  dependencies: number[];
  validation: (state: any) => { isValid: boolean; error?: string };
  onEnter?: (state: any) => Promise<void>;
  onExit?: (state: any) => Promise<void>;
}

export interface StepState {
  currentStep: number;
  completedSteps: number[];
  stepData: Record<string, any>;
  errors: Record<number, string>;
  loading: boolean;
}

export class StepManager {
  private steps: StepConfig[];
  private state: StepState;
  private listeners: ((state: StepState) => void)[] = [];

  constructor(steps: StepConfig[]) {
    this.steps = steps;
    this.state = {
      currentStep: 1,
      completedSteps: [],
      stepData: {},
      errors: {},
      loading: false
    };
  }

  // Subscribe to state changes
  subscribe(listener: (state: StepState) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  // Notify all listeners
  private notify() {
    console.log('StepManager: notify() called with', this.listeners.length, 'listeners');
    console.log('StepManager: Current state:', JSON.stringify(this.state, null, 2));
    this.listeners.forEach(listener => listener(this.state));
  }

  // Get current state
  getState(): StepState {
    return { ...this.state };
  }

  // Get step configuration
  getStep(stepId: number): StepConfig | undefined {
    return this.steps.find(step => step.id === stepId);
  }

  // Get current step configuration
  getCurrentStep(): StepConfig | undefined {
    return this.getStep(this.state.currentStep);
  }

  // Validate step
  validateStep(stepId: number, data: any): { isValid: boolean; error?: string } {
    const step = this.getStep(stepId);
    if (!step) {
      return { isValid: false, error: 'Step not found' };
    }

    try {
      return step.validation(this.state, data);
    } catch (error) {
      return { 
        isValid: false, 
        error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  // Check if step can be accessed
  canAccessStep(stepId: number): boolean {
    const step = this.getStep(stepId);
    if (!step) return false;

    // Check dependencies
    for (const depId of step.dependencies) {
      if (!this.state.completedSteps.includes(depId)) {
        return false;
      }
    }

    return true;
  }

  // Internal navigation without validation (used by completeCurrentStep)
  private async navigateToStepInternal(stepId: number): Promise<{ success: boolean; error?: string }> {
    try {
      this.state.loading = true;
      this.notify();

      // Validate step exists
      const step = this.getStep(stepId);
      if (!step) {
        throw new Error(`Step ${stepId} not found`);
      }

      // Execute onEnter hook
      if (step.onEnter) {
        await step.onEnter({ ...this.state.stepData });
      }

      // Update state
      this.state.currentStep = stepId;
      this.state.errors[stepId] = undefined;

      this.state.loading = false;
      this.notify();

      return { success: true };
    } catch (error) {
      this.state.loading = false;
      this.state.errors[stepId] = error instanceof Error ? error.message : 'Unknown error';
      this.notify();
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  // Navigate to step
  async navigateToStep(stepId: number, data?: any): Promise<{ success: boolean; error?: string }> {
    try {
      this.state.loading = true;
      this.notify();

      // Validate step exists
      const step = this.getStep(stepId);
      if (!step) {
        throw new Error(`Step ${stepId} not found`);
      }

      // Check if step can be accessed
      if (!this.canAccessStep(stepId)) {
        throw new Error(`Cannot access step ${stepId}. Dependencies not met.`);
      }

      // Validate data if provided
      if (data) {
        const validation = this.validateStep(stepId, data);
        if (!validation.isValid) {
          throw new Error(validation.error || 'Validation failed');
        }
      }

      // Execute onEnter hook
      if (step.onEnter) {
        await step.onEnter({ ...this.state.stepData, ...data });
      }

      // Update state
      this.state.currentStep = stepId;
      this.state.errors[stepId] = undefined;

      this.state.loading = false;
      this.notify();

      return { success: true };
    } catch (error) {
      this.state.loading = false;
      this.state.errors[stepId] = error instanceof Error ? error.message : 'Unknown error';
      this.notify();
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  // Complete current step
  async completeCurrentStep(data?: any): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('StepManager: completeCurrentStep called with data:', data);
      this.state.loading = true;
      this.notify();

      const currentStep = this.getCurrentStep();
      if (!currentStep) {
        throw new Error('No current step');
      }

      console.log('StepManager: Current step:', currentStep.id, currentStep.key);

      // Validate current step
      if (data) {
        console.log('StepManager: Validating step with data:', data);
        console.log('StepManager: Current step ID:', this.state.currentStep);
        console.log('StepManager: Data type:', typeof data);
        console.log('StepManager: Data keys:', Object.keys(data || {}));
        const validation = this.validateStep(this.state.currentStep, data);
        console.log('StepManager: Validation result:', validation);
        if (!validation.isValid) {
          console.log('StepManager: Validation failed, throwing error:', validation.error);
          throw new Error(validation.error || 'Validation failed');
        }
      }

      // Execute onExit hook
      if (currentStep.onExit) {
        await currentStep.onExit({ ...this.state.stepData, ...data });
      }

      // Update step data - store data per step
      if (data) {
        this.state.stepData[this.state.currentStep] = { ...this.state.stepData[this.state.currentStep], ...data };
      }

      // Mark step as completed
      if (!this.state.completedSteps.includes(this.state.currentStep)) {
        this.state.completedSteps.push(this.state.currentStep);
      }

      // Move to next step
      const nextStepId = this.getNextStepId();
      console.log('StepManager: Next step ID:', nextStepId);
      if (nextStepId) {
        console.log('StepManager: Navigating to next step:', nextStepId);
        // Navigate to next step without validation since we just completed the current step
        await this.navigateToStepInternal(nextStepId);
      } else {
        console.log('StepManager: No next step available');
      }

      this.state.loading = false;
      this.notify();

      return { success: true };
    } catch (error) {
      this.state.loading = false;
      this.state.errors[this.state.currentStep] = error instanceof Error ? error.message : 'Unknown error';
      this.notify();
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  // Get next step ID
  getNextStepId(): number | null {
    const ordered = [...this.steps].sort((a, b) => a.id - b.id);
    const idx = ordered.findIndex(s => s.id === this.state.currentStep);
    if (idx === -1) return null;
    const next = ordered[idx + 1];
    return next ? next.id : null;
  }

  // Get previous step ID
  getPreviousStepId(): number | null {
    const ordered = [...this.steps].sort((a, b) => a.id - b.id);
    const idx = ordered.findIndex(s => s.id === this.state.currentStep);
    if (idx === -1) return null;
    const prev = ordered[idx - 1];
    return prev ? prev.id : null;
  }

  // Go back to previous step
  async goBack(): Promise<{ success: boolean; error?: string }> {
    const prevStepId = this.getPreviousStepId();
    if (!prevStepId) {
      return { success: false, error: 'No previous step' };
    }

    return this.navigateToStep(prevStepId);
  }

  // Reset to step
  async resetToStep(stepId: number): Promise<{ success: boolean; error?: string }> {
    this.state.completedSteps = this.state.completedSteps.filter(id => id < stepId);
    return this.navigateToStep(stepId);
  }

  // Get progress percentage
  getProgress(): number {
    return (this.state.completedSteps.length / this.steps.length) * 100;
  }

  // Check if all steps are completed
  isComplete(): boolean {
    return this.state.completedSteps.length === this.steps.length;
  }

  // Get step data
  getStepData(stepId: number): any {
    return this.state.stepData[stepId] || {};
  }

  // Set step data
  setStepData(stepId: number, data: any): void {
    this.state.stepData[stepId] = { ...this.state.stepData[stepId], ...data };
    this.notify();
  }

  // Clear errors
  clearErrors(): void {
    this.state.errors = {};
    this.notify();
  }

  // Get error for step
  getError(stepId: number): string | undefined {
    return this.state.errors[stepId];
  }
}
