import { createField, type FormContent, type FormField, type Recipient } from "./index.js";

/**
 * Ready-made NOLT forms, rebuilt from the signed paper originals. HR picks one when
 * creating a form and can still edit it before publishing.
 */
export type FormTemplate = {
  key: string;
  title: string;
  recipient: Recipient;
  description: string;
  build: () => FormContent;
};

type Opts = Partial<Pick<FormField, "required" | "helpText" | "options" | "showIf" | "prefill" | "body">>;

function builder() {
  const fields: FormField[] = [];
  const add = (type: FormField["type"], label: string, opts: Opts = {}) => {
    const field: FormField = { ...createField(type, crypto.randomUUID()), label, ...opts };
    fields.push(field);
    return field;
  };
  return {
    fields,
    heading: (label: string) => add("heading", label),
    note: (label: string, body: string) => add("paragraph", label, { body }),
    text: (label: string, o?: Opts) => add("text", label, o),
    long: (label: string, o?: Opts) => add("textarea", label, o),
    email: (label: string, o?: Opts) => add("email", label, o),
    phone: (label: string, o?: Opts) => add("phone", label, o),
    date: (label: string, o?: Opts) => add("date", label, o),
    choice: (label: string, options: string[], o?: Opts) => add("select", label, { ...o, options }),
    yesNo: (label: string, o?: Opts) => add("select", label, { ...o, options: ["Yes", "No"] }),
    confirm: (label: string, o?: Opts) => add("checkbox", label, o),
    signature: (label: string, o?: Opts) => add("signature", label, o),
    when: (field: FormField, equals: string) => ({ fieldId: field.id, equals }),
  };
}

function employeeDataForm(): FormContent {
  const b = builder();
  b.heading("Personal details");
  b.text("Full name (Surname, First name, Middle name)", { required: true, prefill: "employee.fullName" });
  b.date("Date employed", { required: true, prefill: "employee.startDate" });
  b.text("Type of employment", { prefill: "employee.employmentType" });
  b.date("Date of birth", { required: true });
  b.text("Place of birth", { required: true });
  b.text("Nationality", { required: true });
  b.text("Religion");
  const marital = b.choice("Marital status", ["Single", "Married", "Divorced", "Widowed", "Separated"], { required: true });
  b.text("Maiden name", { showIf: b.when(marital, "Married") });
  b.text("Spouse name", { showIf: b.when(marital, "Married") });
  b.phone("Spouse phone number", { showIf: b.when(marital, "Married") });

  b.heading("Contact details");
  b.text("Residence (where you live now)", { required: true });
  b.phone("Telephone number", { required: true });
  b.email("Email address", { required: true, prefill: "employee.email" });
  b.long("Permanent home address", { required: true });
  b.text("State of origin", { required: true });
  b.text("Local Government Area (LGA)", { required: true });
  b.text("Emergency contact: name", { required: true });
  b.phone("Emergency contact: phone number", { required: true });

  b.heading("Father's details");
  b.text("Father's name (Surname, First name, Middle name)");
  b.long("Father's address");

  b.heading("Schools attended and qualifications");
  b.long("Schools attended, qualifications and dates", {
    required: true,
    helpText: "List each school, the qualification you got and the dates, one per line.",
  });

  b.heading("Bank, pension and tax");
  b.text("Bank name", { required: true });
  b.text("Bank account number", { required: true });
  b.text("Pension administrator");
  b.text("Pension number");
  b.text("Tax ID number");

  b.heading("Next of kin");
  b.text("Next of kin: name and relationship", { required: true });
  b.long("Next of kin: contact address", { required: true });
  b.phone("Next of kin: phone number", { required: true });
  b.email("Next of kin: email");
  b.long("Any other information");

  b.heading("Health information");
  const issues = b.yesNo("Do you have any health issues?", { required: true });
  b.long("Please explain your health issues", { required: true, showIf: b.when(issues, "Yes") });
  b.yesNo("Are you asthmatic?", { required: true });
  b.yesNo("Are you a sickle cell carrier?", { required: true });
  b.yesNo("Are you epileptic?", { required: true });
  b.yesNo("Are you hypertensive?", { required: true });
  b.text("Blood group", { required: true });
  b.text("Genotype", { required: true });
  b.yesNo("Do you use eye glasses?", { required: true });
  return {
    title: "Employee Data Form",
    description: "Your personal, contact, bank and health details for NOLT Finance's records.",
    recipient: "EMPLOYEE",
    fields: b.fields,
  };
}

function employeeDeclaration(): FormContent {
  const b = builder();
  b.note(
    "Please read carefully",
    "Please read the following statements carefully and provide accurate information. Your responses will be treated confidentially and used solely for employment verification purposes.",
  );
  b.heading("1. Criminal record disclosure");
  b.note("Have you ever been:", "Answer Yes or No to each question below.");
  for (const q of [
    "Arrested, charged, or convicted for any criminal offence?",
    "Involved in any fraudulent, dishonest, or misconduct-related activities?",
    "Under investigation by any employer, authority, regulatory body, or institution?",
  ]) {
    const answer = b.yesNo(q, { required: true });
    b.long("Please give details", { required: true, showIf: b.when(answer, "Yes") });
  }
  b.heading("2. Employment integrity declaration");
  b.note(
    "Declaration",
    "I affirm that all information provided in this biodata form is complete, true, and accurate to the best of my knowledge. I understand that:\n\n• Any false, misleading, or omitted information may result in the withdrawal of an employment offer or immediate termination if already employed.\n• The company reserves the right to conduct background checks, verify references, and investigate any information provided.\n• Failure to disclose past misconduct, criminal records, or ongoing investigations may lead to disciplinary action, including termination.",
  );
  b.confirm("I affirm the declaration above.", { required: true });
  b.heading("3. Consent and authorization");
  b.note(
    "Consent",
    "I hereby give NOLT Finance Company Limited permission to verify the information provided, including contacting previous employers, conducting background checks, and confirming identity and employment history.",
  );
  b.confirm("I give my consent and authorization.", { required: true });
  b.text("Employee name", { required: true, prefill: "employee.fullName" });
  b.signature("Signature", { required: true });
  return {
    title: "Employee Declaration & Background Information",
    description: "Your confirmation that the information you gave is true, and your consent for NOLT Finance to verify it.",
    recipient: "EMPLOYEE",
    fields: b.fields,
  };
}

export const formTemplates: FormTemplate[] = [
  { key: "employee-data", title: "Employee Data Form", recipient: "EMPLOYEE", description: "Personal, contact, bank, next of kin and health details.", build: employeeDataForm },
  { key: "employee-declaration", title: "Employee Declaration & Background Information", recipient: "EMPLOYEE", description: "Criminal record disclosure, integrity declaration, consent and signature.", build: employeeDeclaration },
];
