import { motion } from "framer-motion";
import { ChevronRight, TestTube } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { TEST_PROJECT_CONTEXTS, getTestProjectContextById } from "../../lib/testProjectContexts";
import { useState } from "react";

const KMI_PROJECTS = [
  "KMI-1018_BAILIWICK_OTA",
  "KMI-287_SOF_OTA",
  "KMI-311_AIRWAVE_II",
  "KMI-354_BAILIWICK-DA_II",
  "KMI-355_BAILIWICK-AISN_II",
  "KMI-558_GARGOYLE_II",
  "OH_APPLIED_RESEARCH"
];

const SERVICE_PROGRAMS = [
  "Applied Research",
  "Advanced Development",
  "Systems Engineering",
  "Technical Services",
  "Software Development",
  "Cybersecurity Services"
];

interface StepProjectContextProps {
  procurementType: string;
  setProcurementType: (value: string) => void;
  serviceProgram: string;
  setServiceProgram: (value: string) => void;
  technicalPOC: string;
  setTechnicalPOC: (value: string) => void;
  selectedProject: string;
  setSelectedProject: (value: string) => void;
  popStart: string;
  setPopStart: (value: string) => void;
  popCompletion: string;
  setPopCompletion: (value: string) => void;
  onNext: () => void;
}

export function StepProjectContext({
  procurementType,
  setProcurementType,
  serviceProgram,
  setServiceProgram,
  technicalPOC,
  setTechnicalPOC,
  selectedProject,
  setSelectedProject,
  popStart,
  setPopStart,
  popCompletion,
  setPopCompletion,
  onNext,
}: StepProjectContextProps) {
  // Test project context selection
  const [selectedTestContext, setSelectedTestContext] = useState<string>("");

  // Handle test project context selection
  const handleTestContextSelect = (contextId: string) => {
    if (contextId === "custom") {
      setSelectedTestContext("");
      return;
    }

    const testContext = getTestProjectContextById(contextId);
    if (testContext) {
      setSelectedTestContext(contextId);
      setProcurementType(testContext.procurementType);
      setServiceProgram(testContext.serviceProgram);
      setTechnicalPOC(testContext.technicalPOC);
      setSelectedProject(testContext.selectedProject);
      setPopStart(testContext.popStart);
      setPopCompletion(testContext.popCompletion);
    }
  };
  const handleContinue = () => {
    if (!procurementType) {
      alert("Please select a Procurement Type");
      return;
    }
    if (!serviceProgram.trim()) {
      alert("Please enter a Service Program");
      return;
    }
    if (!technicalPOC.trim()) {
      alert("Please enter a KMI Technical POC");
      return;
    }
    if (!selectedProject) {
      alert("Please select a KMI Project");
      return;
    }

    const isSoftware = procurementType.toLowerCase().includes("software") ||
                       procurementType.toLowerCase().includes("license");
    if (isSoftware && (!popStart || !popCompletion)) {
      alert("POP Start and POP Completion are required for software/license procurement");
      return;
    }

    onNext();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-border">
        <CardHeader>
          <CardTitle>Project Context</CardTitle>
          <CardDescription>
            Provide basic information about your procurement project
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Test Project Context Selection */}
          <Card className="border-blue-200 bg-blue-50/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <TestTube className="h-4 w-4 text-blue-600" />
                Quick Test Projects
              </CardTitle>
              <CardDescription className="text-xs">
                Select a pre-filled project context for quick testing (development only)
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                <Select value={selectedTestContext} onValueChange={handleTestContextSelect}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a test project or enter custom details" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Custom Project (Manual Entry)</SelectItem>
                    {TEST_PROJECT_CONTEXTS.map((context) => (
                      <SelectItem key={context.id} value={context.id}>
                        {context.name} - {context.selectedProject}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {selectedTestContext && selectedTestContext !== "custom" && (
                  <div className="text-xs text-muted-foreground bg-white p-2 rounded border">
                    <strong>Selected:</strong> {getTestProjectContextById(selectedTestContext)?.description}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="procurementType">
                Procurement Type <span className="text-destructive">*</span>
              </Label>
              <Select value={procurementType} onValueChange={setProcurementType}>
                <SelectTrigger id="procurementType">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Purchase Order">Purchase Order</SelectItem>
                  <SelectItem value="Contract">Contract</SelectItem>
                  <SelectItem value="Subcontract">Subcontract</SelectItem>
                  <SelectItem value="Credit Card Auth">Credit Card Auth</SelectItem>
                  <SelectItem value="Software License">Software License</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="serviceProgram">
                Service Program <span className="text-destructive">*</span>
              </Label>
              <Select value={serviceProgram} onValueChange={setServiceProgram}>
                <SelectTrigger id="serviceProgram">
                  <SelectValue placeholder="Select program..." />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_PROGRAMS.map((program) => (
                    <SelectItem key={program} value={program}>
                      {program}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="technicalPOC">
                KMI Technical POC <span className="text-destructive">*</span>
              </Label>
              <Input
                id="technicalPOC"
                placeholder="e.g., John Doe"
                value={technicalPOC}
                onChange={(e) => setTechnicalPOC(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project">
                KMI Project Supported <span className="text-destructive">*</span>
              </Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger id="project">
                  <SelectValue placeholder="Select project..." />
                </SelectTrigger>
                <SelectContent>
                  {KMI_PROJECTS.map((project) => (
                    <SelectItem key={project} value={project}>
                      {project}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="popStart">
                POP Start Date
                {(procurementType.toLowerCase().includes("software") || 
                  procurementType.toLowerCase().includes("license")) && (
                  <span className="text-destructive ml-1">*</span>
                )}
              </Label>
              <Input
                id="popStart"
                type="date"
                value={popStart}
                onChange={(e) => setPopStart(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="popCompletion">
                POP Completion Date
                {(procurementType.toLowerCase().includes("software") || 
                  procurementType.toLowerCase().includes("license")) && (
                  <span className="text-destructive ml-1">*</span>
                )}
              </Label>
              <Input
                id="popCompletion"
                type="date"
                value={popCompletion}
                onChange={(e) => setPopCompletion(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={handleContinue} size="lg" className="gap-2">
              Continue
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}



