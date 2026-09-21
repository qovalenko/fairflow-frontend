import { Navigate, Route, Routes } from 'react-router'
import Container from '@/components/shared/Container'
import { useSessionUser } from '@/store/authStore'
import ActivityList from './Activities/ActivityList'
import ActivityCalendar from './Activities/ActivityCalendar'
import ActivityDetails from './Activities/ActivityDetails'
import ActivityEdit from './Activities/ActivityEdit'
import ActivityTrash from './Activities/ActivityTrash'

const ActivitiesIndex = () => {
    const defaultView = useSessionUser((s) => s.user.defaultActivitiesView)
    if (defaultView === 'calendar') {
        return <Navigate to="calendar" replace />
    }
    return <ActivityList />
}

const activityRoutes = (
    <>
        <Route index element={<ActivitiesIndex />} />
        <Route path="calendar" element={<ActivityCalendar />} />
        <Route path="trash" element={<ActivityTrash />} />
        <Route path="new" element={<ActivityEdit />} />
        <Route path=":id" element={<ActivityDetails />} />
        <Route path=":id/edit" element={<ActivityEdit />} />
    </>
)

const ActivitiesModule = () => {
    return (
        <Container>
            <Routes>
                {activityRoutes}
                <Route path="activities">
                    {activityRoutes}
                </Route>
                <Route path="*" element={<Navigate to="." replace />} />
            </Routes>
        </Container>
    )
}
export default ActivitiesModule
