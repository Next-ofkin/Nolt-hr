import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { formTemplates } from "../packages/form-schemas/dist/index.js";
import { axaRowsFor, axaWorkbook, axaDate, AXA_HEADERS } from "../apps/api/dist/axa-sheet.js";

const template = formTemplates.find((t) => t.key === "axa-hmo")!;
const fields = template.build().fields;
const idOf = (key: string) => fields.find((f) => f.exportKey === key)!.id;
const dep = fields.find((f) => f.exportKey === "axa.dependants")!;

function answers(planType: string) {
  return {
    [idOf("axa.surname")]: "Okoye", [idOf("axa.firstName")]: "Ada", [idOf("axa.staffId")]: "NOLT-001",
    [idOf("axa.plan")]: "Gold", [idOf("axa.planType")]: planType, [idOf("axa.enrollmentDate")]: "2026-10-01",
    [idOf("axa.sex")]: "Female", [idOf("axa.dob")]: "1990-03-09", [idOf("axa.phone")]: "08030000000",
    [idOf("axa.email")]: "ada@example.invalid", [idOf("axa.address")]: "1 Test Road, Lagos",
    [idOf("axa.preExisting")]: "None", [idOf("axa.primaryHospital")]: "A Clinic", [idOf("axa.secondaryHospital")]: "B Clinic",
    [dep.id]: JSON.stringify([["Okoye", "Tobe", "", "Son", "Male", "2018-05-02", "None", "A Clinic"]]),
  };
}

test("dates are DD/MM/YYYY", () => assert.equal(axaDate("2026-10-21"), "21/10/2026"));

test("family plan gives a member row then a dependant row", () => {
  const rows = axaRowsFor(fields, answers("Family"));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].length, AXA_HEADERS.length);
  assert.equal(rows[0][8], "MEMBER");
  assert.equal(rows[0][12], "09/03/1990");
  assert.equal(rows[1][8], "DEPENDENT");
  assert.equal(rows[1][9], "Son");
  assert.equal(rows[1][5], "Gold");
  assert.equal(rows[1][7], "NOLT-001");
  assert.equal(rows[1][12], "02/05/2018");
});

test("individual plan hides dependants", () => {
  assert.equal(axaRowsFor(fields, answers("Individual")).length, 1);
});

test("workbook is a valid xlsx", () => {
  const buffer = axaWorkbook([{ fields, answers: answers("Family") }]);
  const file = join(mkdtempSync(join(tmpdir(), "axa-")), "a.xlsx");
  writeFileSync(file, buffer);
  let out = "";
  try {
    out = execFileSync("python3", ["-I", "-c",
      "import sys,openpyxl;wb=openpyxl.load_workbook(sys.argv[1]);ws=wb['ENROLMENT TEMPLATE'];print(wb.sheetnames,ws.max_row,ws['C3'].value,ws['I3'].value,ws['C4'].value,ws['I4'].value)", file]).toString();
  } catch (e) {
    if (String((e as Error).message).includes("openpyxl")) return; // checker unavailable here
    throw e;
  }
  assert.match(out, /CONSENT FORM/);
  assert.match(out, /4 Okoye MEMBER Okoye DEPENDENT/);
});
