import test from "node:test";
import assert from "node:assert/strict";
import { splitAssignmentsByPack } from "../apps/web/src/lib/split-assignments-by-pack.js";

test("HR forms appear only inside their assigned onboarding pack", () => {
  const forms = [
    {id:"form-a",title:"Personal details"},
    {id:"form-b",title:"Employment declaration"},
    {id:"form-c",title:"Separate document"},
  ];
  const packs = [{forms:[{assignmentId:"form-a"},{assignmentId:"form-b"}]}];
  const result=splitAssignmentsByPack(forms,packs);
  assert.deepEqual(result.standalone.map(form=>form.id),["form-c"]);
  assert.equal(result.assignmentsById.get("form-a")?.title,"Personal details");
  assert.equal(result.assignmentsById.get("form-b")?.title,"Employment declaration");
});

test("same-title employee forms retain their distinct assignment IDs", () => {
  const forms=[{id:"one",title:"Declaration"},{id:"two",title:"Declaration"}];
  const groups=[{forms:[{assignmentId:"one"}]}];
  const result=splitAssignmentsByPack(forms,groups);
  assert.deepEqual(result.standalone.map(form=>form.id),["two"]);
});

test("no packs leaves all individually assigned forms visible", () => {
  const forms=[{id:"first"},{id:"second"}];
  assert.deepEqual(splitAssignmentsByPack(forms,[]).standalone,forms);
});
