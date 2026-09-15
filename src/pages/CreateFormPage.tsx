import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCreateFormTemplate } from '../lib/form-builder-queries'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Label } from '../components/ui/label'

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
      setError('Form name is required.')
      return
    }

    setError(null)
    try {
      const result = await createMutation.mutateAsync({
        name: name.trim(),
        category: category.trim() || 'General',
        description: description.trim() || undefined,
      })

      navigate(`/hr/forms/${result.templateId}/builder/${result.versionId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create form template.')
    }
  }

  return (
    <div className="page p-6 max-w-3xl mx-auto space-y-6">
      <Link to="/hr/forms" className="text-sm font-medium text-gray-500 hover:text-gray-900">
        ← Back to Forms
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Create New HR Form</h1>
        <p className="text-sm text-gray-500 mt-1">
          Initialize a new versioned HR form template and launch NOLT Form Studio.
        </p>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <p>{error}</p>
        </div>
      )}

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Form Name *</Label>
              <Input
                id="name"
                type="text"
                placeholder="e.g. Employee Background Declaration"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <select
                id="category"
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="General">General HR</option>
                <option value="Onboarding">Onboarding</option>
                <option value="Compliance">Compliance & Legal</option>
                <option value="Benefits">Benefits & Claims</option>
                <option value="Performance">Performance Review</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Form Description</Label>
              <Textarea
                id="description"
                rows={3}
                placeholder="Brief internal description of this form's purpose..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="pt-4 flex justify-end gap-3">
              <Link to="/hr/forms">
                <Button variant="outline" type="button">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Form & Open Studio'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
