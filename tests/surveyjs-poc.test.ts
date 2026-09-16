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
  const deps = { ...pkg.default.dependencies, ...pkg.default.devDependencies } as Record<string, string | undefined>
  assert.equal(deps['survey-creator-react'], undefined)
  assert.equal(deps['survey-creator'], undefined)
})

test('survey definition explicitly configures widthMode responsive', () => {
  assert.equal(employeeSurveyJson.widthMode, 'responsive')
})

test('SurveyJS definition has expected 6 multi-page sections with shortTitles', () => {
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
  for (const page of employeeSurveyJson.pages) {
    assert.ok(page.shortTitle, `Page ${page.name} must have a shortTitle`)
  }
})

test('No question row contains more than 2 paired columns', () => {
  for (const page of employeeSurveyJson.pages) {
    let consecutiveSameRow = 0
    for (const elem of page.elements) {
      const e = elem as Record<string, unknown>
      if (e.startWithNewLine === false) {
        consecutiveSameRow += 1
      } else {
        consecutiveSameRow = 1
      }
      assert.ok(
        consecutiveSameRow <= 2,
        `Element ${e.name} on page ${page.name} creates a row with > 2 columns`,
      )
    }
  }
})

test('Page 1 Personal Info passport photograph starts on new line and takes full width', () => {
  const page1 = employeeSurveyJson.pages[0]
  const passportQuestion = page1.elements.find((e) => e.name === 'passport_photo') as Record<string, unknown> | undefined
  assert.ok(passportQuestion)
  assert.equal(passportQuestion.type, 'file')
  assert.equal(passportQuestion.acceptedTypes, 'image/*')
  assert.equal(passportQuestion.startWithNewLine, true)
  assert.equal(passportQuestion.minWidth, '100%')
})

test('Page 3 Education History uses paneldynamic question type', () => {
  const page3 = employeeSurveyJson.pages[2]
  const educationQuestion = page3.elements.find((e) => e.name === 'education_history') as Record<string, unknown> | undefined
  assert.ok(educationQuestion)
  assert.equal(educationQuestion.type, 'paneldynamic')
  assert.equal(educationQuestion.panelAddText, 'Add another education')
})

test('Page 5 Health details question uses native visibleIf conditional logic', () => {
  const page5 = employeeSurveyJson.pages[4]
  const healthDetailsQuestion = page5.elements.find((e) => e.name === 'health_issue_details') as Record<string, unknown> | undefined
  assert.ok(healthDetailsQuestion)
  assert.equal(healthDetailsQuestion.visibleIf, "{has_health_issues} = 'Yes'")
})

test('Page 6 Review & Declaration includes built-in signaturepad question', () => {
  const page6 = employeeSurveyJson.pages[5]
  const signatureQuestion = page6.elements.find((e) => e.name === 'employee_signature') as Record<string, unknown> | undefined
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
