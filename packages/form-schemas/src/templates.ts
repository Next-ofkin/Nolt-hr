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

type Opts = Partial<Pick<FormField, "required" | "helpText" | "options" | "showIf" | "prefill" | "body" | "columns" | "exportKey" | "fixedRows" | "maxRows" | "totalEquals" | "attachmentPurpose">>;

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
    photo: (label: string, o?: Opts) => add("passport_photo", label, o),
    file: (label: string, o?: Opts) => add("file", label, o),
    table: (label: string, columns: (Omit<FormField["columns"][number], "exportKey"> & { exportKey?: string | null })[], o?: Opts) =>
      add("table", label, { ...o, columns: columns.map((c) => ({ ...c, exportKey: c.exportKey ?? null })) }),
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
  b.table(
    "Schools attended",
    [
      { label: "School / institution", kind: "text", required: true },
      { label: "Qualification", kind: "text", required: true },
      { label: "Dates attended", kind: "text", required: false },
    ],
    { required: true, maxRows: 8, helpText: "Add one row for each school or institution." },
  );

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


const COMPANY = "NOLT FINANCE COMPANY LIMITED (RC. 1870631), whose registered address is Suite 4, No 11 Awolowo Road, Ikoyi, Lagos";

function confidentiality(): FormContent {
  const b = builder();
  b.note(
    "Employee Confidentiality Agreement",
    `This Confidentiality Agreement is made between the EMPLOYEE named below (which expression includes his/her assigns, administrators, successors-in-title and agents) of the first part, AND ${COMPANY} (“NOLT”, which expression includes its assigns, administrators, successors-in-title and agents) of the other part.\n\nWHEREAS\na. The EMPLOYEE and NOLT are each referred to as ‘Party’ and together as ‘Parties’.\nb. The Employee has applied for, and has been offered employment at NOLT as the role shown below.`,
  );
  b.text("Employee full name", { required: true, prefill: "employee.fullName" });
  b.long("Employee address", { required: true });
  b.text("Role offered at NOLT", { required: true, prefill: "employee.jobTitle" });
  b.heading("It is agreed as follows");
  b.note(
    "1. Interpretation",
    "‘Confidentiality’ contemplates privacy or restriction in disclosing data;\n‘Employment’ means the state of being a staff member or agent of NOLT;\n‘In Writing’ includes written communication through emails, WhatsApp and other social media.",
  );
  b.note(
    "2. Parties’ Obligations",
    "2.1.1 The Employee understands that in the course of his/her employment with NOLT, (s)he will be exposed to NOLT’s trade secrets, confidential, proprietary and other privileged information.\n\n2.1.2 The Employee agrees that all such knowledge and information (s)he is exposed to shall at all material times be regarded as strictly confidential, and are, and shall remain the sole and confidential property of NOLT.\n\n2.1.3 The Employee agrees to always take reasonable steps in order to protect the confidentiality of the said information and will only reveal or disclose the trade secrets to another person, firm, corporation, company or entity if NOLT instructs him/her to do so in writing.\n\n2.1.4 At all times, the Employee agrees to protect NOLT’s interests within the confines of the law.\n\n2.1.5 The Employee shall not use NOLT’s confidential Information or proprietary data for his/her personal benefit or gain, or for the benefit of others during or after his/her employment with NOLT, without NOLT’s consent duly obtained.\n\n2.1.6 During the employment period with NOLT, the Employee agrees not to engage in business competition which is similar to NOLT’s.\n\n2.1.7 During the employment period with NOLT, the Employee undertakes to disclose in writing to the Company all discoveries, improvements and inventions, registrable under Copyright Laws, or not.\n\n2.1.8 The Employee undertakes to further disclose whether the discoveries, improvements and inventions were made alone or with others.\n\n2.1.9 The Employee agrees that all discoveries, improvements and inventions (intellectual, visual, audio, pictures or material) are NOLT’s sole property irrespective of the appearance of the Employee in such pictures, videos, etc.\n\n2.1.10 In the event that the Employee intends to use these intellectual properties, after exit from NOLT’s employment, the Employee agrees that NOLT’s consent must be duly obtained in writing.\n\n2.1.11 The Employee agrees that NOLT reserves the right to an injunction in the event that a breach occurs, and this is not exclusive, as NOLT may pursue any other remedies, legal or equitable, for a breach or threatened breach of these obligations.\n\n2.1.12 The Employee agrees that these conditions and obligations will continue even after his/her exit from NOLT.\n\n2.1.13 The Parties agree that information in the public domain, and such similar non-confidential information, do not apply under this Agreement.",
  );
  b.note(
    "3. Periodicity",
    "3.1 The Parties agree that apart from the obligations in Pars. 2.1.6, 2.1.7 and similar provisions, these obligations shall be binding even after the exit of the Employee from NOLT’s employment.\n\n3.2 It is agreed that this Agreement does not guarantee the continuation of employment between the Employer and Employee.\n\n3.3 Both parties understand that the Employee’s relationship with the Employer is terminable upon the delivery of the required, applicable length of notices.",
  );
  b.note(
    "4. Governing Law",
    "4.1 The Parties agree that this Agreement shall be construed in accordance with laws of the Federal Republic of Nigeria.\n\n4.2 Any disputes arising under this Agreement shall be resolved in accordance with Nigerian laws.",
  );
  b.note(
    "5. Data Protection",
    "5.1 The Parties confirm compliance with the provisions of all data protection laws and regulations which are relevant to the processing of personal data under this Agreement, including the Nigeria Data Protection Regulations (NDPR) 2019: Implementation Framework, Guidelines for the Management of Personal Data by Public Institutions in Nigeria, 2020 or any modification or amendments thereof.\n\n5.2 The Parties hereby undertake to adopt best practices in the handling of their mutual data, utilizing administrative, technical, and physical security measures to ensure data protection and privacy.\n\n5.3 For avoidance of doubt, Parties consent mutually to the exchange and use of their data in accordance with the foregoing regulations and the provisions of this Agreement.",
  );
  b.heading("Signed by the Employee");
  b.confirm("I have read and understood this Agreement and I agree to be bound by it.", { required: true });
  b.text("Name", { required: true, prefill: "employee.fullName" });
  b.text("Designation", { required: true, prefill: "employee.jobTitle" });
  b.signature("Signature", { required: true });
  b.note(
    "For NOLT",
    "The date of signing is recorded with your signature. NOLT’s authorised signatory and witness complete their part when HR reviews and approves this form.",
  );
  return {
    title: "Employee Confidentiality Agreement",
    description: "NOLT’s confidentiality agreement. Read it fully, then sign.",
    recipient: "EMPLOYEE",
    fields: b.fields,
  };
}

function indemnity(): FormContent {
  const b = builder();
  b.note(
    "Employee Indemnity Agreement",
    `This Agreement is made between the Employee named below (which expression includes his/her assigns, administrators, successors-in-title and agents) of the first part, AND ${COMPANY} (“NOLT”, which expression includes its assigns, administrators, successors-in-title and agents) of the other part.\n\nWHEREAS\na. The EMPLOYEE and NOLT are each referred to as ‘Party’ and together as ‘Parties’.\nb. The Employee has applied for, and has been offered employment at NOLT in the role shown below.`,
  );
  b.text("Employee full name", { required: true, prefill: "employee.fullName" });
  b.long("Employee address", { required: true });
  b.text("Designation", { required: true, prefill: "employee.jobTitle" });
  b.note(
    "1. Purpose and Scope",
    "1.1 The Employee understands that in the course of his/her execution of duties required under the Employment Contract, (s)he shall be granted access and exposure to assets, resources and interface with diverse stakeholders which include agents, service-providers, customers, guarantors, colleagues, etc.\n\n1.2 This Agreement exists to ensure that the Employee is above-board in all his/her dealings with and on behalf of NOLT as an employer.",
  );
  b.note(
    "2. Parties’ Obligations",
    "2.1 The Employee shall always abide by NOLT’s Anti-Bribery and Corruption Policy, Anti-Fraud Policy, and all relevant Policies throughout the period of employment, and also abide by same where they remain binding even after employment with NOLT.\n\n2.2 The Employee undertakes not to abuse his/her position, or use same as a platform for defrauding NOLT, or for personal gain.\n\n2.2 The Employee undertakes not to take advantage of or exploit, stakeholders, or conduct himself/herself in a way that would amount to a breach of the trust NOLT has reposed in the Employee.\n\n2.3 The Employee accepts that a level of trust has been bestowed upon him/her by NOLT, and as an Employee, shall be expected to be, and indeed, shall be above board at all material times in his/her dealings on behalf of NOLT and in the execution of duties under the Employment Contract with NOLT.\n\n2.4 The Employee hereby indemnifies NOLT as to any losses, damages, and allied risks that could occur to NOLT which are caused by the Employee. The Employee, his/her Guarantor/Surety agree to be jointly and severally liable for these events where the cause is traceable to the Employee.\n\n2.5 The Employee agrees that (s)he will not purport to represent or impersonate NOLT in any capacity after leaving NOLT’s employment; The Employee agrees not to represent NOLT in any capacity after leaving the employment, unless duly authorized in writing to do so as an agent.\n\n2.6 The Employee agrees that the above obligations are binding even after the Employee has left the employment of NOLT.\n\n2.7 This Agreement shall be binding on the Employee and his/her Guarantor/Surety, and both shall be jointly and severally liable for violations.\n\n2.8 The Employee agrees that NOLT reserves the right to an injunction in the event that a breach occurs, and this is not exclusive, as NOLT may pursue any other remedies, legal or equitable, for a breach or threatened breach of these obligations.\n\n2.9 The Employee and his/her Guarantor/Surety agree to pay for losses which they cause NOLT; they also agree to assist in defending any lawsuits.\n\nFor avoidance of assumptions, the following shall be considered to trigger NOLT’s enforcement of its rights under this Agreement: negligence, fraud, theft, misappropriation of funds, breach of trust, forgery, costs of litigation, etc.\n\n2.10 The Employee agrees that if (s)he is found to have engaged in any fraudulent activity during the course of his/her employment with NOLT, or even after leaving the employment of NOLT, the Employee could face prosecution for crimes, without prejudice to other measures NOLT may decide to take in order to remedy the situation.",
  );
  b.note(
    "3. Term",
    "3.1 This Agreement shall become binding from the commencement of the Employee’s employment with NOLT and shall enure even after the contract, to the extent that the Employee is restrained from unauthorized representation of NOLT in engagements with third Parties.",
  );
  b.note(
    "4. Severability",
    "If any provision or part-provision of this agreement is or becomes invalid, illegal or unenforceable, it shall be deemed deleted, but that shall not affect the validity and enforceability of the rest of this agreement. If any provision or part-provision of this agreement is deemed deleted, the parties shall negotiate in good faith to agree a replacement provision that, to the greatest extent possible, achieves the intended commercial result of the original provision.",
  );
  b.note("5. Governing Law and Dispute Resolution", "5.1 This Agreement shall be governed by and construed in accordance with the laws of the Federal Republic of Nigeria.");
  b.note(
    "6. Data Protection",
    "6.1 The Parties acknowledge and agree to comply with all applicable data protection laws and regulations in Nigeria, including the Nigeria Data Protection Regulation (NDPR), in connection with the exchange, storage, and use of personal data under this Agreement.",
  );
  b.heading("Signed by the Employee");
  b.confirm("I have read and understood this Agreement and I agree to be bound by it.", { required: true });
  b.text("Name", { required: true, prefill: "employee.fullName" });
  b.text("Designation", { required: true, prefill: "employee.jobTitle" });
  b.phone("Phone", { required: true });
  b.email("Email", { required: true, prefill: "employee.email" });
  b.signature("Signature", { required: true });
  b.heading("Your Guarantor / Surety (witness)");
  b.note("Guarantor details", "Give the details of the person who will stand as your Guarantor/Surety. They sign their own Guarantor’s Form separately.");
  b.text("Guarantor name", { required: true });
  b.long("Guarantor address", { required: true });
  b.phone("Guarantor phone", { required: true });
  b.email("Guarantor email", { required: true });
  b.note("For NOLT", "NOLT’s authorised signatory completes the company part when HR reviews and approves this form. The date of signing is recorded with your signature.");
  return {
    title: "Employee Indemnity Agreement",
    description: "NOLT’s indemnity agreement. Read it fully, then sign.",
    recipient: "EMPLOYEE",
    fields: b.fields,
  };
}

function guarantorForm(): FormContent {
  const b = builder();
  b.note("Guarantor’s Form", "Please complete this form yourself. You will need your government ID, proof of address, proof of income, a passport photograph and your signature.");
  b.text("Your full name", { required: true });
  b.long("Your address", { required: true });
  b.text("Name of the employee (Mr./Mrs./Miss)", { required: true });
  b.text("How many years have you known the employee?", { required: true });
  b.note(
    "Guarantee",
    "I do hereby certify that the employee named above is known to me and I have known him/her for the number of years stated.\n\nIn consideration of your employing him/her, I hereby agree with the company to furnish the following guarantee.\n\n1. That the employee shall at all times, so long as he/she be in the service of the Company honestly, diligently and faithfully fulfill all duties, as required of him/her.\n\n2. That I will indemnify you (within the limits hereinafter mentioned) against all losses, charges, damages and expenses which the company may sustain and incur by reason of any misconduct, action, negligence or fraud on the part of the employee towards the company while employed by it.\n\n3. That If I am unable to produce him/her for any loss or liability suffered or incurred as a result of his/her action, inaction or fraud; and if he is unable to in his/her own capacity remedy or refund within an agreed time loss or liability suffered or incurred; I as the Guarantor accepts to remedy or refund the loss or liability suffered.\n\n4. That I shall pay the employee’s one month’s salary in lieu of notice if he/she leaves the Company without the required notice and fails to pay one month’s salary in lieu of notice as required.\n\n5. That I have the right to withdraw this guarantee at any time by giving one months’ notice in writing to the Company by me or in case of my death by my personal representative.\n\n6. That my obligation and responsibilities in this undertaking have been read, and I very well understand them.\n\n7. That I diligently accept all the above conditions in good faith and pledge to stand by them as required by circumstances and from time to time.",
  );
  b.confirm("I have read, understood and accept all the conditions above.", { required: true });
  b.heading("Guarantor’s details");
  b.long("Home address", { required: true });
  b.email("Email address", { required: true });
  b.text("Occupation", { required: true });
  b.long("Name and address of employer", { required: true });
  b.phone("Telephone number(s)", { required: true });
  b.photo("Your passport photograph", { required: true });
  b.note(
    "Guarantor requirements",
    "The guarantor must:\n1. Provide a valid government-issued ID (passport, national ID card, or driver’s license).\n2. Provide proof of address (utility bill, tenancy agreement, or official letter dated within the last 3 months).\n3. Provide proof of income (employment letter, or bank statements for the last 3–6 months).\n4. Be employed or have a verifiable source of income sufficient to cover the guaranteed obligation.\n5. Not be a current beneficiary or dependent on the applicant.\n6. Not be a family member or relative of the applicant.\n7. Provide valid contact information (phone number, email address, and physical address).\n8. Be willing to sign the guarantor agreement and accept full responsibility in case of default.\n9. Not have any current legal or financial restrictions (e.g., bankruptcy, insolvency proceedings).\n10. Provide a recent passport-size photograph (if required).\n\nProfessionals such as a Banker, Director at a registered company, Manager or Supervisor in a recognized organization, Civil Servant / Government Officer (from level 10 upward), or Business Owner (with verifiable business registration) are accepted.",
  );
  b.confirm("I meet the guarantor requirements listed above.", { required: true });
  b.file("Government-issued ID (passport, national ID card or driver’s license)", { required: true });
  b.file("Proof of address (dated within the last 3 months)", { required: true });
  b.file("Proof of income (employment letter, or 3–6 months of bank statements)", { required: true });
  b.signature("Your signature", { required: true });
  return {
    title: "Guarantor’s Form",
    description: "To be completed and signed by the employee’s guarantor.",
    recipient: "GUARANTOR",
    fields: b.fields,
  };
}

function assignedTools(): FormContent {
  const b = builder();
  b.note(
    "Assigned work tools",
    "I acknowledge that as an employee of NOLT FINANCE COMPANY LIMITED, I will take proper care of all work tools that I have been assigned for the execution of my job and return upon exit of the organization.",
  );
  b.table(
    "Work tools assigned to me",
    [
      { label: "Work tool", kind: "text", required: true },
      { label: "Quantity", kind: "number", required: false },
      { label: "Serial number", kind: "text", required: false },
    ],
    {
      fixedRows: ["Laptop, Charger and Adaptor", "Mobile Phone", "Mouse", "ID Card", "MTN SIM Card", "Laptop Stand", "Laptop Bag"],
      helpText: "Fill in the quantity and serial number for each tool you received. Leave a tool empty if you did not receive it.",
    },
  );
  b.table(
    "Others (specify)",
    [
      { label: "Work tool", kind: "text", required: true },
      { label: "Quantity", kind: "number", required: false },
      { label: "Serial number", kind: "text", required: false },
    ],
    { maxRows: 5 },
  );
  const issue = b.yesNo("Any identifiable issues with the work tools assigned to you?", { required: true });
  b.long("Describe the issues", { required: true, showIf: b.when(issue, "Yes") });
  b.text("Employee name", { required: true, prefill: "employee.fullName" });
  b.text("Designation / job role", { required: true, prefill: "employee.jobTitle" });
  b.signature("Employee signature", { required: true });
  return {
    title: "Assigned Work Tools",
    description: "Confirm the equipment NOLT has given you.",
    recipient: "EMPLOYEE",
    fields: b.fields,
  };
}

function beneficiaryNomination(): FormContent {
  const b = builder();
  b.note(
    "Beneficiary Nomination Form",
    "Group Life Assurance Policy or Death-In-Service Benefit Scheme is a contract of insurance designed to provide financial compensation to the dependent(s) of an employee or member who dies while in the service of an employer or being a member of an association. The policy is designed to provide a lump sum benefit to the named beneficiary of the deceased. This form elicits complete and accurate information about the beneficiary nominated.\n\nInsurer: Stanbic IBTC Insurance Limited (RC1036818), Wealth House, Plot 1678, Olakunle Bakare Close Off Sanusi Fafunwa, Victoria Island, Lagos. insure@stanbicibtc.com, 012706801.",
  );
  b.heading("Section 1: Assured’s details");
  b.note("Employer", "Employer’s name: NOLT Finance Company Limited");
  b.text("Employee’s full name (Surname, First name, Other name)", { required: true, prefill: "employee.fullName" });
  b.text("Staff / member number", { prefill: "employee.employeeNumber" });
  b.date("Date of birth", { required: true });
  b.phone("Phone", { required: true });
  b.email("Email", { required: true, prefill: "employee.email" });
  b.long("Address", { required: true });
  b.choice("Gender", ["Male", "Female"], { required: true });
  b.heading("Section 2: Beneficiaries’ details");
  b.note("Beneficiaries", "Add as many beneficiaries as you wish and their respective proportions. Payment will be made in the proportion(s) indicated against the name of each nominee if more than one is named. The proportions must add up to 100%.");
  b.table(
    "Beneficiaries",
    [
      { label: "Surname", kind: "text", required: true },
      { label: "First name", kind: "text", required: true },
      { label: "Relationship", kind: "text", required: true },
      { label: "Proportion %", kind: "percent", required: true },
      { label: "Date of birth", kind: "date", required: true },
      { label: "Phone number / email", kind: "text", required: true },
      { label: "Address", kind: "text", required: true },
    ],
    { required: true, maxRows: 8, totalEquals: 100 },
  );
  b.heading("Section 3: Trustee or guardian");
  b.note("If a beneficiary is under 18", "Where the nominated beneficiary is below 18 years, please state a guardian or trustee to discharge and administer the benefit. Leave this empty if it does not apply.");
  b.table(
    "Trustee or guardian for minors",
    [
      { label: "Minor’s surname", kind: "text", required: true },
      { label: "Minor’s first name", kind: "text", required: true },
      { label: "Trustee or guardian", kind: "text", required: true },
      { label: "Date of birth", kind: "date", required: false },
      { label: "Phone number / email", kind: "text", required: true },
      { label: "Address", kind: "text", required: true },
    ],
    { maxRows: 5 },
  );
  b.heading("Authorisation and signature");
  b.note("Authorisation", "I authorise Stanbic IBTC Insurance Limited to use the above information and any other relevant information to administer this policy.");
  b.confirm("I authorise this and confirm the information is complete and correct.", { required: true });
  b.signature("Signature", { required: true });
  return {
    title: "Beneficiary Nomination Form",
    description: "Who should receive your group life benefit. Proportions must add up to 100%.",
    recipient: "EMPLOYEE",
    fields: b.fields,
  };
}

function inductionChecklist(): FormContent {
  const b = builder();
  b.text("Employee’s name", { required: true, prefill: "employee.fullName" });
  b.text("Job title", { required: true, prefill: "employee.jobTitle" });
  b.text("Department", { required: true, prefill: "employee.department" });
  b.date("Date resumed", { required: true, prefill: "employee.startDate" });
  b.note("Please mark each item", "Mark each item Done or Not done as you go through your induction.");
  const sections: [string, string[]][] = [
    ["Section A: Personal documentation", ["Biodata form", "Guarantors’ forms", "Reference letters", "Educational credentials"]],
    ["Section B: The company", ["Corporate vision and mission", "Corporate culture and core values", "Company products and services (company profile)", "Explanation of employee’s department in relation to others", "Introduction to other departments", "Training on the software used by each department and functions"]],
    ["Section C: Condition of service", ["Working hours explained", "NOLT HR policy read", "NOLT HR policy manual acknowledged", "Confidentiality agreement", "Beneficiary forms"]],
    ["Section D: Health", ["Medical provision (HMO)"]],
    ["Section E: Company rules and regulations", ["Resumption time", "Poor performance and sanctions understood", "Authorized absence", "Grievance procedure", "Disciplinary procedure"]],
    ["Section F: Employee’s job", ["Position in department", "Job description given and explained", "Importance of your job in the organization", "Reporting line and department structure explained"]],
    ["Section G: Welfare", ["Company training and development policy"]],
    ["Section H: Safety", ["Location of fire extinguisher", "Who to report accidents, incidents and near misses to", "Location of first aid box"]],
    ["Section I: Tours", ["Tour of the office", "Introduction to the directors", "Introduction to all staff", "Induction lunch", "Show location of the convenience"]],
  ];
  for (const [title, items] of sections) {
    b.heading(title);
    for (const item of items) b.choice(item, ["Done", "Not done"], { required: true });
  }
  b.heading("Confirmation");
  b.confirm("I have received the above induction training.", { required: true });
  b.signature("New employee’s signature", { required: true });
  b.note("For NOLT", "The Head of Operations and HR certifies that they conducted/supervised the induction when HR reviews and approves this form.");
  return {
    title: "New Employee Induction Checklist",
    description: "Go through each item with your HR contact, then sign.",
    recipient: "EMPLOYEE",
    fields: b.fields,
  };
}

function policyAcknowledgement(): FormContent {
  const b = builder();
  b.note("HR Policy Manual Acknowledgement", "Having read, digested and familiarized yourself with the HR Policy Manual, please fill this out.");
  b.text("Staff name", { required: true, prefill: "employee.fullName" });
  b.date("Date of resumption", { required: true, prefill: "employee.startDate" });
  b.date("Date read", { required: true });
  b.text("Version read", { required: true });
  b.note(
    "Declaration",
    "I, the above-named, hereby declare that I have read and understood the provisions of the Nolt Finance Company Limited Human Resources Policies and Procedures Reference Book. I undertake to abide by the Company’s rules and regulations as contained in this book and as may be amended from time to time.\n\nI also acknowledge that the provisions therein form an integral part of my contract of employment with the company.",
  );
  b.confirm("I make this declaration.", { required: true });
  b.signature("Signature", { required: true });
  return {
    title: "HR Policy Manual Acknowledgement",
    description: "Confirm you have read the HR Policy Manual.",
    recipient: "EMPLOYEE",
    fields: b.fields,
  };
}


function axaEnrolment(): FormContent {
  const b = builder();
  const key = (k: string, o: Opts = {}): Opts => ({ ...o, exportKey: `axa.${k}` });
  b.note(
    "AXA Mansard HMO consent",
    "We hereby give our consent to AXA Mansard to control and process our personal data (Surname, First Name, Date of Birth, Email and Phone number) for the purpose of health management in accordance with the HMO scheme agreed with NOLT FINANCE COMPANY LIMITED.\n\nWe are aware and informed that we may withdraw consent at any time by contacting AXA Mansard Health either by email at healthcare@axamansard.com or by telephone on 0700AXAMANSARD (07002926267273).\n\nWe are aware that personal data shall be forwarded to our employer for verification, transferred to selected AXA Mansard In-Network Hospitals for processing where required. We further grant our consent for this purpose. We also give consent for personal data to be transferred to other third party as we may recommend to AXA Mansard in furtherance of the HMO scheme.\n\nThe HR Team can be contacted by Email: hr@noltfinance.com, Phone: 08033227220.\n\nWe affirm that we are aware and take cognizance of our rights under the relevant Data protection Laws in Nigeria and other terms detailed in the Data Protection and privacy policy of AXA Mansard, available at https://www.axamansard.com/privacy-policy/.",
  );
  b.confirm("I agree that my staff personal information can be used in line with AXA Mansard’s Data Privacy Policy.", { required: true });
  b.heading("Your details");
  b.text("Surname", key("surname", { required: true }));
  b.text("First name", key("firstName", { required: true }));
  b.text("Middle name", key("middleName"));
  b.text("Staff ID", key("staffId", { required: true, prefill: "employee.employeeNumber", helpText: "Your staff number. This is compulsory for AXA." }));
  b.text("Enrollee number", key("enrolleeNumber", { helpText: "Only if you are already enrolled with AXA Mansard (for additions). Otherwise leave empty." }));
  b.text("Plan", key("plan", { required: true, helpText: "The AXA plan you were given, as written by HR." }));
  b.choice("Plan type", ["Individual", "Family"], key("planType", { required: true }));
  b.date("Enrollment date", key("enrollmentDate", { required: true, prefill: "employee.startDate" }));
  b.choice("Sex", ["Male", "Female"], key("sex", { required: true }));
  b.date("Date of birth", key("dob", { required: true }));
  b.phone("Phone number", key("phone", { required: true }));
  b.email("Official e-mail", key("email", { required: true, prefill: "employee.email" }));
  b.long("Address", key("address", { required: true }));
  b.long("Pre-existing condition", key("preExisting", { required: true, helpText: "Compulsory. Write None if you have no pre-existing condition." }));
  b.text("Primary hospital", key("primaryHospital", { required: true }));
  b.text("Secondary hospital", key("secondaryHospital", { required: true }));
  const family = b.fields.find((f) => f.exportKey === "axa.planType")!;
  b.heading("Dependants");
  b.table(
    "Dependants",
    [
      { label: "Surname", kind: "text", required: true, exportKey: "axa.dep.surname" },
      { label: "First name", kind: "text", required: true, exportKey: "axa.dep.firstName" },
      { label: "Middle name", kind: "text", required: false, exportKey: "axa.dep.middleName" },
      { label: "Relationship (Husband / Wife / Son / Daughter)", kind: "text", required: true, exportKey: "axa.dep.relationship" },
      { label: "Sex", kind: "text", required: true, exportKey: "axa.dep.sex" },
      { label: "Date of birth", kind: "date", required: true, exportKey: "axa.dep.dob" },
      { label: "Pre-existing condition (write None if none)", kind: "text", required: true, exportKey: "axa.dep.preExisting" },
      { label: "Primary hospital", kind: "text", required: true, exportKey: "axa.dep.primaryHospital" },
    ],
    { maxRows: 8, exportKey: "axa.dependants", showIf: b.when(family, "Family"), helpText: "Add one row for each family member to be covered." },
  );
  b.signature("Signature", { required: true });
  return {
    title: "AXA Mansard HMO Enrolment",
    description: "Your health insurance (HMO) enrolment and consent. HR sends this information to AXA Mansard.",
    recipient: "EMPLOYEE",
    fields: b.fields,
  };
}

export const formTemplates: FormTemplate[] = [
  { key: "employee-data", title: "Employee Data Form", recipient: "EMPLOYEE", description: "Personal, contact, bank, next of kin and health details.", build: employeeDataForm },
  { key: "employee-declaration", title: "Employee Declaration & Background Information", recipient: "EMPLOYEE", description: "Criminal record disclosure, integrity declaration, consent and signature.", build: employeeDeclaration },
  { key: "confidentiality", title: "Employee Confidentiality Agreement", recipient: "EMPLOYEE", description: "The full NOLT confidentiality agreement with the employee’s signature.", build: confidentiality },
  { key: "indemnity", title: "Employee Indemnity Agreement", recipient: "EMPLOYEE", description: "The full NOLT indemnity agreement, signature and guarantor details.", build: indemnity },
  { key: "guarantor", title: "Guarantor’s Form", recipient: "GUARANTOR", description: "Guarantee wording, guarantor details, passport photo, ID documents and signature.", build: guarantorForm },
  { key: "work-tools", title: "Assigned Work Tools", recipient: "EMPLOYEE", description: "Table of equipment given to the employee, with serial numbers and signature.", build: assignedTools },
  { key: "beneficiary", title: "Beneficiary Nomination Form", recipient: "EMPLOYEE", description: "Group life nomination with beneficiary table (must total 100%) and guardian table.", build: beneficiaryNomination },
  { key: "induction", title: "New Employee Induction Checklist", recipient: "EMPLOYEE", description: "Nine-section checklist of induction items, with employee confirmation.", build: inductionChecklist },
  { key: "policy-ack", title: "HR Policy Manual Acknowledgement", recipient: "EMPLOYEE", description: "Declaration that the HR Policy Manual has been read.", build: policyAcknowledgement },
  { key: "axa-hmo", title: "AXA Mansard HMO Enrolment", recipient: "EMPLOYEE", description: "AXA consent, member details and dependants. HR can download the AXA enrolment spreadsheet from approved forms.", build: axaEnrolment },
];
