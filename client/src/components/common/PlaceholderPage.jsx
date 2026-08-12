import EmptyState from '../ui/EmptyState'
import PageHeader from '../ui/PageHeader'

function PlaceholderPage({ title, phase }) {
  return (
    <>
      <PageHeader
        title={title}
        description={`The ${title} module will be implemented in ${phase}.`}
      />
      <EmptyState
        title={`${title} Module`}
        description="Scaffolded in Phase 1. This area will be built out in a later phase."
      />
    </>
  )
}

export default PlaceholderPage
