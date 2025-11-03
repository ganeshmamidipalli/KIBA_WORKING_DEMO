from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Literal
from datetime import datetime, timezone


DocVersion = Literal["1.0.0"]


@dataclass
class Contact:
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None


@dataclass
class TechnicalPOC:
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None


@dataclass
class EvaluatedVendor:
    name: str
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    quoteAmount: Optional[float] = None
    leadTimeDays: Optional[int] = None
    notes: Optional[str] = None
    attachments: Optional[List[str]] = None


Compliance = Literal['ATF','OSHA','SAM.gov','Debarment','Small Business','Other']


@dataclass
class SelectedVendor:
    name: str
    address: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    taxId: Optional[str] = None
    paymentTerms: Optional[str] = None
    deliverablesSummary: Optional[str] = None
    totalAwardAmount: Optional[float] = None
    selectionRationale: str = ""
    complianceChecks: List[Compliance] = field(default_factory=list)


@dataclass
class Attachment:
    id: str
    title: str
    type: Literal['quote','scope','evaluation','other']


@dataclass
class Approval:
    role: Literal['Requester','Technical POC','Program Manager','Contracts','Finance','Executive']
    name: str
    email: Optional[str] = None
    approvedAt: Optional[str] = None


@dataclass
class CreatedBy:
    id: str
    name: str
    email: Optional[str] = None


@dataclass
class ProcurementInfo:
    kind: Literal['Contract','Subcontract','Purchase Order','Credit Card Auth','Corporate Account Order']
    serviceProgram: str
    technicalPOC: TechnicalPOC
    projectsSupported: List[str]
    estimatedCost: float
    popStart: Optional[str] = None
    popEnd: Optional[str] = None
    suggestedType: Optional[Literal['Contract','Purchase Order','Credit Card','Corporate Account Order']] = None
    scopeBrief: str = ""
    competitionType: Literal['Competitive','Sole Source','Limited Competition'] = 'Competitive'
    multipleVendorsAvailable: Optional[bool] = None
    # Additional fields for procurement document
    documentTitle: Optional[str] = None
    department: Optional[str] = None
    budgetCode: Optional[str] = None
    approver: Optional[str] = None
    justification: Optional[str] = None
    vendorEvaluationDescription: Optional[str] = None


@dataclass
class Vendors:
    evaluated: List[EvaluatedVendor]
    selected: SelectedVendor


@dataclass
class Meta:
    requestId: str
    createdAt: str
    createdBy: CreatedBy
    lastUpdatedAt: str
    environment: Literal['prod','staging','dev']


@dataclass
class ProcurementDocumentV1:
    docVersion: DocVersion
    procurement: ProcurementInfo
    vendors: Vendors
    meta: Meta
    attachments: Optional[List[Attachment]] = None
    approvals: List[Approval] = field(default_factory=list)

    @staticmethod
    def now_iso() -> str:
        return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')

    def to_dict(self) -> Dict:
        # Lightweight dataclass to dict converter
        from dataclasses import asdict
        return asdict(self)


