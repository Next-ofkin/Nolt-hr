import React, { useState } from 'react'
import type { FormSchema } from '../features/shadcn-form-poc/domain/form-schema'
import { defaultDemoFormSchema } from '../features/shadcn-form-poc/domain/demo-form'
import { FormBuilder } from '../features/shadcn-form-poc/builder/FormBuilder'
import { NoltDynamicForm } from '../features/shadcn-form-poc/renderer/NoltDynamicForm'
import { LayoutGrid, Eye } from 'lucide-react'

export const ShadcnFormPocPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'builder' | 'preview'>('builder')
  const [schema, setSchema] = useState<FormSchema>(defaultDemoFormSchema)

  return (
    <div className="page employee-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Form builder</p>
          <h1>{schema.title}</h1>
          <p className="subtitle">Design onboarding forms and preview how employees will fill them out.</p>
        </div>

        <div className="view-switcher" role="tablist" aria-label="Builder view">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'builder'}
            id="tab-builder-btn"
            onClick={() => setActiveTab('builder')}
            className={`view-switcher-btn${activeTab === 'builder' ? ' active' : ''}`}
          >
            <LayoutGrid style={{ width: 15, height: 15 }} /> Builder
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'preview'}
            id="tab-preview-btn"
            onClick={() => setActiveTab('preview')}
            className={`view-switcher-btn${activeTab === 'preview' ? ' active' : ''}`}
          >
            <Eye style={{ width: 15, height: 15 }} /> Employee Preview
          </button>
        </div>
      </div>

      {activeTab === 'builder' ? (
        <FormBuilder
          schema={schema}
          onChangeSchema={setSchema}
          onSwitchToPreview={() => setActiveTab('preview')}
        />
      ) : (
        <NoltDynamicForm
          schema={schema}
          onSwitchToBuilder={() => setActiveTab('builder')}
        />
      )}
    </div>
  )
}

export default ShadcnFormPocPage
