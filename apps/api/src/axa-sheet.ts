import { fieldVisible, parseTable, type FormField } from "@nolt/form-schemas";
import { buildXlsx } from "./xlsx.js";

/** Column order exactly as in AXA Mansard's "ENROLMENT TEMPLATE" sheet. */
export const AXA_HEADERS = [
  "S/N", "ENROLLEE NUMBER (IN CASES OF ADDITION)", "SURNAME", "FIRST NAME", "MIDDLE NAME", "PLAN",
  "PLAN TYPE (INDIVIDUAL/FAMILY)", "STAFF ID (COMPULSORY) ", "STATUS (MEMBER/DEPENDENT)",
  "RELATIONSHIP (HUSBAND/WIFE/SON/ DAUGHTER)", "ENROLLMENT DATE", "SEX", "DATE OF BIRTH (DD/MM/YYYY)",
  "PHONE NUMBER", "PRE-EXISTING CONDITION (COMPULSORY)", "PRIMARY HOSPITAL", "SECONDARY HOSPITAL",
  "OFFICIAL E-MAIL ", "ADDRESS",
] as const;

export const AXA_CONSENT =
  "We hereby give our consent to AXA Mansard to control and process our personal data (Surname, First Name, Date of Birth, Email and Phone number) for the purpose of health management in accordance with the HMO scheme agreed with .... NOLT FINANCE COMPANY LIMITED\n\nWe are aware and informed that we may withdraw consent at any time by contacting AXA Mansard Health either by email at healthcare@axamansard.com or by telephone on 0700AXAMANSARD (07002926267273).\n\nWe are aware that personal data shall be forwarded to our employer for verification, transferred to selected AXA Mansard In-Network Hospitals for processing where required. We further grant our consent for this purpose. We also give consent for personal data to be transferred to other third party as we may recommend to AXA Mansard in furtherance of the HMO scheme.\n\nThe HR Team can be contacted by Email: hr@noltfinance.com, Phone: 08033227220.\n\nWe affirm that we are aware and take cognizance of our rights under the relevant Data protection Laws in Nigeria and other terms detailed in the Data Protection and privacy policy of AXA Mansard available on https://www.axamansard.com/privacy-policy/";

export const hasAxaFields = (fields: unknown): fields is FormField[] =>
  Array.isArray(fields) && fields.some((f) => typeof f?.exportKey === "string" && f.exportKey.startsWith("axa."));

/** 2026-10-21 → 21/10/2026 (AXA wants DD/MM/YYYY). Anything else is passed through. */
export function axaDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value.trim();
}

type Answers = Record<string, string | boolean | null | undefined>;

/** One member row, then one row per dependant, for a single approved form. */
export function axaRowsFor(fields: FormField[], answers: Answers): string[][] {
  const value = (key: string) => {
    const f = fields.find((x) => x.exportKey === key);
    if (!f || !fieldVisible(f, answers as Record<string, string | boolean | null>)) return "";
    const v = answers[f.id];
    return typeof v === "string" ? v.trim() : "";
  };
  const member = {
    enrollee: value("axa.enrolleeNumber"), surname: value("axa.surname"), first: value("axa.firstName"),
    middle: value("axa.middleName"), plan: value("axa.plan"), planType: value("axa.planType"),
    staffId: value("axa.staffId"), enrolled: axaDate(value("axa.enrollmentDate")), sex: value("axa.sex"),
    dob: axaDate(value("axa.dob")), phone: value("axa.phone"), pre: value("axa.preExisting"),
    primary: value("axa.primaryHospital"), secondary: value("axa.secondaryHospital"),
    email: value("axa.email"), address: value("axa.address"),
  };
  const rows: string[][] = [[
    "", member.enrollee, member.surname, member.first, member.middle, member.plan, member.planType,
    member.staffId, "MEMBER", "", member.enrolled, member.sex, member.dob, member.phone, member.pre,
    member.primary, member.secondary, member.email, member.address,
  ]];
  const table = fields.find((f) => f.exportKey === "axa.dependants");
  if (table && fieldVisible(table, answers as Record<string, string | boolean | null>)) {
    const parsed = parseTable(answers[table.id], table);
    if (parsed !== "invalid") {
      const at = (key: string) => table.columns.findIndex((c) => c.exportKey === key);
      for (const row of parsed.filter((r) => r.some((c) => c.trim()))) {
        const cell = (key: string) => (at(key) >= 0 ? (row[at(key)] ?? "").trim() : "");
        // Dependants share the member's plan, staff ID, enrolment date, contact details and secondary hospital.
        rows.push([
          "", "", cell("axa.dep.surname"), cell("axa.dep.firstName"), cell("axa.dep.middleName"), member.plan,
          member.planType, member.staffId, "DEPENDENT", cell("axa.dep.relationship"), member.enrolled,
          cell("axa.dep.sex"), axaDate(cell("axa.dep.dob")), member.phone, cell("axa.dep.preExisting"),
          cell("axa.dep.primaryHospital"), member.secondary, member.email, member.address,
        ]);
      }
    }
  }
  return rows;
}

export function axaWorkbook(forms: { fields: FormField[]; answers: Answers }[]): Buffer {
  const body = forms.flatMap((f) => axaRowsFor(f.fields, f.answers));
  body.sort((a, b) => 0); // keep submission order; members stay with their dependants
  const rows: (string | null)[][] = [
    [null, null, null, null, null, "I agree that my Staff personal information can be used in line with AXA Mansard’s Data Privacy Policy. www.axamansard.com/privacy-policy"],
    [...AXA_HEADERS],
    ...body.map((r, i) => [String(i + 1), ...r.slice(1)]),
  ];
  return buildXlsx([
    { name: "CONSENT FORM", rows: [["CONSENT FORM"], [AXA_CONSENT], ["https://www.axamansard.com/privacy-policy/"]], widths: [110], headerRows: [1] },
    { name: "ENROLMENT TEMPLATE", rows, widths: [6, 18, 18, 18, 18, 14, 16, 16, 16, 18, 14, 8, 16, 16, 28, 22, 22, 28, 34], headerRows: [2], merges: ["F1:J1"] },
  ]);
}
