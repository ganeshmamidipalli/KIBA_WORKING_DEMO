/**
 * Test Project Contexts for Development and Testing
 * Pre-filled project context data for easy testing of step 1
 */

export interface TestProjectContext {
  id: string;
  name: string;
  procurementType: string;
  serviceProgram: string;
  technicalPOC: string;
  selectedProject: string;
  popStart: string;
  popCompletion: string;
  description: string;
}

export const TEST_PROJECT_CONTEXTS: TestProjectContext[] = [
  {
    id: "sof-ota",
    name: "SOF OTA Development",
    procurementType: "Contract",
    serviceProgram: "Advanced Development",
    technicalPOC: "ganesh",
    selectedProject: "KMI-287_SOF_OTA",
    popStart: "2024-01-15",
    popCompletion: "2024-12-31",
    description: "Special Operations Forces Over-The-Air update system development"
  },
  {
    id: "ai-ml-platform",
    name: "AI/ML Platform Infrastructure",
    procurementType: "Contract",
    serviceProgram: "Research & Development",
    technicalPOC: "sarah.chen",
    selectedProject: "AI-ML-2024-001",
    popStart: "2024-02-01",
    popCompletion: "2024-11-30",
    description: "Enterprise AI and machine learning platform infrastructure setup"
  },
  {
    id: "cyber-security",
    name: "Cybersecurity Enhancement",
    procurementType: "Contract",
    serviceProgram: "Security Operations",
    technicalPOC: "mike.rodriguez",
    selectedProject: "CYBER-SEC-2024",
    popStart: "2024-03-01",
    popCompletion: "2024-10-31",
    description: "Cybersecurity tools and infrastructure enhancement project"
  },
  {
    id: "cloud-migration",
    name: "Cloud Migration Initiative",
    procurementType: "Contract",
    serviceProgram: "IT Modernization",
    technicalPOC: "jennifer.kim",
    selectedProject: "CLOUD-MIG-2024",
    popStart: "2024-01-01",
    popCompletion: "2024-09-30",
    description: "Legacy system migration to cloud infrastructure"
  },
  {
    id: "data-analytics",
    name: "Data Analytics Platform",
    procurementType: "Contract",
    serviceProgram: "Data Science",
    technicalPOC: "david.patel",
    selectedProject: "DATA-ANALYTICS-2024",
    popStart: "2024-04-01",
    popCompletion: "2024-12-15",
    description: "Enterprise data analytics and visualization platform"
  }
];

export const getTestProjectContextById = (id: string): TestProjectContext | undefined => {
  return TEST_PROJECT_CONTEXTS.find(context => context.id === id);
};

export const getTestProjectContextNames = (): Array<{id: string, name: string}> => {
  return TEST_PROJECT_CONTEXTS.map(context => ({
    id: context.id,
    name: context.name
  }));
};
