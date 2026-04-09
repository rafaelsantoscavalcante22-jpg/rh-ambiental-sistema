import { Navigate, useLocation } from 'react-router-dom'

/** Unificado em «Conferência de transportes»; mantém links antigos `/checklist-transporte`. */
export default function ChecklistTransporte() {
  const { search } = useLocation()
  return <Navigate to={`/conferencia-transporte${search}`} replace />
}
