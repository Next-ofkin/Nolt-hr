import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getMyOnboardingAssignments,
  startMyOnboarding,
  submitOnboardingFormResponse,
} from './employee-onboarding-repository'

export function useMyOnboardingAssignments(enabled = true) {
  return useQuery({
    queryKey: ['employee_onboarding_assignments', 'mine'],
    queryFn: getMyOnboardingAssignments,
    enabled,
  })
}

export function useStartMyOnboarding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (assignmentId: string) => startMyOnboarding(assignmentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employee_onboarding_assignments', 'mine'] })
    },
  })
}

export function useSubmitOnboardingFormResponse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { itemId: string; responseData: Record<string, unknown> }) => submitOnboardingFormResponse(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employee_onboarding_assignments', 'mine'] })
    },
  })
}
