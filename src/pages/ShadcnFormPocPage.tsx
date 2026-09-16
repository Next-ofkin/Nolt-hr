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
    <div className="page employee-page" style={{ width: '100%', maxWidth: '1280px', margin: '0 auto', paddingInline: 'clamp(16px, 3vw, 24px)' }}>
      {/* View Switcher Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.75rem',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted, #64748b)' }}>
          SHADCN-Native Form Builder Visual POC
        </div>

        {/* Segmented Control Switcher */}
        <div
          style={{
            display: 'inline-flex',
            background: '#e2e8f0',
            padding: '3px',
            borderRadius: '8px',
            gap: '3px',
          }}
        >
          <button
            type="button"
            id="tab-builder-btn"
            onClick={() => setActiveTab('builder')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 0.9rem',
              borderRadius: '6px',
              border: 0,
              background: activeTab === 'builder' ? 'var(--surface, #ffffff)' : 'transparent',
              color: activeTab === 'builder' ? 'var(--primary, #2563eb)' : 'var(--text-muted, #64748b)',
              fontWeight: activeTab === 'builder' ? 600 : 500,
              fontSize: '0.85rem',
              cursor: 'pointer',
              boxShadow: activeTab === 'builder' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            <LayoutGrid style={{ width: '15px', height: '15px' }} /> Builder
          </button>
          <button
            type="button"
            id="tab-preview-btn"
            onClick={() => setActiveTab('preview')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 0.9rem',
              borderRadius: '6px',
              border: 0,
              background: activeTab === 'preview' ? 'var(--surface, #ffffff)' : 'transparent',
              color: activeTab === 'preview' ? 'var(--primary, #2563eb)' : 'var(--text-muted, #64748b)',
              fontWeight: activeTab === 'preview' ? 600 : 500,
              fontSize: '0.85rem',
              cursor: 'pointer',
              boxShadow: activeTab === 'preview' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            <Eye style={{ width: '15px', height: '15px' }} /> Employee Preview
          </button>
        </div>
      </div>

      {/* Render Active Tab */}
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
