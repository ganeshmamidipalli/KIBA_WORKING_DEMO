/**
 * Custom Hook for Step Management
 * Provides a clean interface for step navigation and state management
 */

import { useState, useEffect, useCallback } from 'react';
import { StepManager, StepState } from '../lib/stepManager';
import { STEP_CONFIGS } from '../lib/stepConfigs';

export interface UseStepManagerReturn {
  // State
  currentStep: number;
  completedSteps: number[];
  stepData: Record<string, any>;
  errors: Record<number, string>;
  loading: boolean;
  progress: number;
  
  // Current step info
  currentStepConfig: any;
  canGoNext: boolean;
  canGoBack: boolean;
  
  // Actions
  navigateToStep: (stepId: number, data?: any) => Promise<{ success: boolean; error?: string }>;
  completeCurrentStep: (data?: any) => Promise<{ success: boolean; error?: string }>;
  goBack: () => Promise<{ success: boolean; error?: string }>;
  goNext: () => Promise<{ success: boolean; error?: string }>;
  setStepData: (stepId: number, data: any) => void;
  clearErrors: () => void;
  
  // Validation
  validateCurrentStep: (data?: any) => { isValid: boolean; error?: string };
  canAccessStep: (stepId: number) => boolean;
  
  // Utilities
  isComplete: boolean;
  getStepData: (stepId: number) => any;
  getError: (stepId: number) => string | undefined;
}

export function useStepManager(): UseStepManagerReturn {
  const [stepManager] = useState(() => new StepManager(STEP_CONFIGS));
  const [state, setState] = useState<StepState>(stepManager.getState());

  // Subscribe to step manager changes
  useEffect(() => {
    const unsubscribe = stepManager.subscribe((newState) => {
      console.log('useStepManager: Received state update:', JSON.stringify(newState, null, 2));
      setState(newState);
    });

    return unsubscribe;
  }, [stepManager]);

  // Get current step configuration
  const currentStepConfig = stepManager.getCurrentStep();

  // Check if can go next
  const canGoNext = useCallback(() => {
    const nextStepId = stepManager.getNextStepId();
    return nextStepId ? stepManager.canAccessStep(nextStepId) : false;
  }, [stepManager]);

  // Check if can go back
  const canGoBack = useCallback(() => {
    const prevStepId = stepManager.getPreviousStepId();
    return prevStepId !== null;
  }, [stepManager]);

  // Navigate to step
  const navigateToStep = useCallback(async (stepId: number, data?: any) => {
    return stepManager.navigateToStep(stepId, data);
  }, [stepManager]);

  // Complete current step
  const completeCurrentStep = useCallback(async (data?: any) => {
    return stepManager.completeCurrentStep(data);
  }, [stepManager]);

  // Go back
  const goBack = useCallback(async () => {
    return stepManager.goBack();
  }, [stepManager]);

  // Go next
  const goNext = useCallback(async () => {
    const nextStepId = stepManager.getNextStepId();
    if (!nextStepId) {
      return { success: false, error: 'No next step available' };
    }
    return stepManager.navigateToStep(nextStepId);
  }, [stepManager]);

  // Set step data
  const setStepData = useCallback((stepId: number, data: any) => {
    stepManager.setStepData(stepId, data);
  }, [stepManager]);

  // Clear errors
  const clearErrors = useCallback(() => {
    stepManager.clearErrors();
  }, [stepManager]);

  // Validate current step
  const validateCurrentStep = useCallback((data?: any) => {
    return stepManager.validateStep(state.currentStep, data);
  }, [stepManager, state.currentStep]);

  // Check if can access step
  const canAccessStep = useCallback((stepId: number) => {
    return stepManager.canAccessStep(stepId);
  }, [stepManager]);

  // Get step data
  const getStepData = useCallback((stepId: number) => {
    return stepManager.getStepData(stepId);
  }, [stepManager]);

  // Get error
  const getError = useCallback((stepId: number) => {
    return stepManager.getError(stepId);
  }, [stepManager]);

  return {
    // State
    currentStep: state.currentStep,
    completedSteps: state.completedSteps,
    stepData: state.stepData,
    errors: state.errors,
    loading: state.loading,
    progress: stepManager.getProgress(),
    
    // Current step info
    currentStepConfig,
    canGoNext: canGoNext(),
    canGoBack: canGoBack(),
    
    // Actions
    navigateToStep,
    completeCurrentStep,
    goBack,
    goNext,
    setStepData,
    clearErrors,
    
    // Validation
    validateCurrentStep,
    canAccessStep,
    
    // Utilities
    isComplete: stepManager.isComplete(),
    getStepData,
    getError
  };
}
