import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCreateFormTemplate } from '../lib/form-builder-queries'

export default function CreateFormPage() {
  const navigate = useNavigate()
  const createMutation = useCreateFormTemplate()

  const [name, setName] = useState('')
  const [category, setCategory] = useState('General')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Form Name is required.')
      return
    }

    setError(null)
    try {
      const result = await createMutation.mutateAsync({
        name: name.trim(),
        category: category.trim(),
        description: description.trim(),
      })
      // Redirect directly to visual Form Builder for Version 1
      navigate(`/hr/forms/${result.templateId}/builder/${result.versionId}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to create form.'
      setError(msg)
    }
  }

  return (
    <div className="page create-form-page" style={{ maxWidth: '640px' }}>
      <Link to="/hr/forms" className="back-link">← Back to Forms</Link>

      <div className="page-heading">
        <div>
          <p className="eyebrow">FORM TEMPLATE</p>
          <h1>Create New Form</h1>
          <p className="subtitle">Set up a new reusable HR form template.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card">
        {error && (
          <div className="alert alert-error mb-4" role="alert">
            <p>{error}</p>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="form-name">Form Name *</label>
          <input
            id="form-name"
            type="text"
            className="input"
            placeholder="e.g. Beneficiary Nomination Form"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="form-category">Category</label>
          <select
            id="form-category"
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="General">General</option>
            <option value="Onboarding">Onboarding</option>
            <option value="Declarations">Declarations</option>
            <option value="Agreements">Agreements</option>
            <option value="Benefits">Benefits</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="form-description">Description</label>
          <textarea
            id="form-description"
            className="input"
            rows={3}
            placeholder="Brief description of this form's purpose..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="form-actions mt-4">
          <Link to="/hr/forms" className="btn btn-ghost">
            Cancel
          </Link>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating Form…' : 'Create & Open Builder'}
          </button>
        </div>
      </form>
    </div>
  )
}
