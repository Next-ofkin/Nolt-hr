import assert from 'node:assert/strict'
import test from 'node:test'
import { employeeSurveyJson } from '../src/features/surveyjs-poc/survey-definition.ts'
import { EMPLOYEE_MANAGER_ROLES } from '../src/lib/employee-domain.ts'

test('survey-react-ui is listed as dependency', async () => {
  const pkg = await import('../package.json', { with: { type: 'json' } })
  assert.ok(pkg.default.dependencies['survey-react-ui'])
})

test('survey creator is NOT installed', async () => {
  const pkg = await import('../package.json', { with: { type: 'json' } })
  const deps = { ...pkg.default.dependencies, ...pkg.default.devDependencies }
  assert.equal(deps['survey-creator-react'], undefined)
  assert.equal(deps['survey-creator'], undefined)
})

test('SurveyJS definition has expected 6 multi-page sections', () => {
  assert.equal(employeeSurveyJson.pages.length, 6)
  const pageNames = employeeSurveyJson.pages.map((p) => p.name)
  assert.deepEqual(pageNames, [
    'personal_info',
    'employment_contact',
    'emergency_education',
    'financial_nok',
    'health_information',
    'review_declaration',
  ])
})

test('Page 1 Personal Info includes file upload for passport photograph', () => {
  const page1 = employeeSurveyJson.pages[0]
  const passportQuestion = page1.elements.find((e) => e.name === 'passport_photo')
  assert.ok(passportQuestion)
  assert.equal(passportQuestion.type, 'file')
  assert.equal(passportQuestion.acceptedTypes, 'image/*')
})

test('Page 3 Education History uses paneldynamic question type', () => {
  const page3 = employeeSurveyJson.pages[2]
  const educationQuestion = page3.elements.find((e) => e.name === 'education_history')
  assert.ok(educationQuestion)
  assert.equal(educationQuestion.type, 'paneldynamic')
  assert.equal(educationQuestion.panelAddText, 'Add another education')
})

test('Page 5 Health details question uses native visibleIf conditional logic', () => {
  const page5 = employeeSurveyJson.pages[4]
  const healthDetailsQuestion = page5.elements.find((e) => e.name === 'health_issue_details')
  assert.ok(healthDetailsQuestion)
  assert.equal(healthDetailsQuestion.visibleIf, "{has_health_issues} = 'Yes'")
})

test('Page 6 Review & Declaration includes built-in signaturepad question', () => {
  const page6 = employeeSurveyJson.pages[5]
  const signatureQuestion = page6.elements.find((e) => e.name === 'employee_signature')
  assert.ok(signatureQuestion)
  assert.equal(signatureQuestion.type, 'signaturepad')
})

test('Role protection: admin and hr allowed, employee denied', () => {
  assert.ok(EMPLOYEE_MANAGER_ROLES.includes('admin'))
  assert.ok(EMPLOYEE_MANAGER_ROLES.includes('hr'))
  assert.equal(
    EMPLOYEE_MANAGER_ROLES.includes('employee' as unknown as typeof EMPLOYEE_MANAGER_ROLES[number]),
    false,
  )
})

test('SurveyJS POC has zero database dependencies', () => {
  assert.equal((employeeSurveyJson as unknown as Record<string, unknown>).tableName, undefined)
})
