import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { Loader2 } from "lucide-react";
import * as api from "../../lib/api";

interface StepProcurementPreviewProps {
  requestId: string;
  payload: any; // conforms to ProcurementDocumentV1
  onBack: () => void;
  onFinalized: (result: { html_url: string; pdf_url?: string | null; docx_url?: string | null; hash: string; version: string }) => void;
}

export function StepProcurementPreview({ requestId, payload, onBack, onFinalized }: StepProcurementPreviewProps) {
  const [html, setHtml] = useState<string>("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [confirmChecked, setConfirmChecked] = useState<boolean>(false);
  const [finalizing, setFinalizing] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const resp = await api.renderProcurementDraft(requestId, payload);
        setHtml(resp.html || "");
        setWarnings(resp.warnings || []);
      } catch (e) {
        console.error("Draft render failed", e);
        setHtml("<p style='color:red'>Failed to render draft. Please go back and try again.</p>");
      } finally {
        setLoading(false);
      }
    })();
  }, [requestId, payload]);

  const srcDoc = useMemo(() => html, [html]);

  const handleFinalize = async () => {
    if (!confirmChecked) return;
    setFinalizing(true);
    try {
      const result = await api.finalizeProcurement(requestId, payload);
      onFinalized(result);
      // Open HTML download immediately for convenience
      if (result?.html_url) window.open(`${api.API_BASE}${result.html_url}`, "_blank");
    } catch (e) {
      console.error("Finalize failed", e);
      alert("Failed to finalize the document. Please try again.");
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Preview & Confirm Procurement Summary</CardTitle>
          <CardDescription>
            Review the generated document. You may go back to edit sections. Once confirmed, we will finalize and provide a download link.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {warnings && warnings.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <strong className="block mb-1">Warnings</strong>
              <ul className="list-disc ml-5">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="h-[70vh] w-full border rounded overflow-hidden bg-white">
            {loading ? (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Rendering draft...
              </div>
            ) : (
              <iframe title="procurement-preview" className="w-full h-full" srcDoc={srcDoc} />
            )}
          </div>

          <div className="flex items-start gap-3">
            <Checkbox id="confirm" checked={confirmChecked} onCheckedChange={(v) => setConfirmChecked(Boolean(v))} />
            <label htmlFor="confirm" className="text-sm leading-tight">
              I confirm the information is complete and correct.
            </label>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={onBack}>Back</Button>
            <Button onClick={handleFinalize} disabled={!confirmChecked || finalizing} className="gap-2">
              {finalizing ? (<><Loader2 className="h-4 w-4 animate-spin"/> Finalizing...</>) : (<>Approve & Generate PDF</>)}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}




