import React from 'react'
import ReactDOM from 'react-dom/client'
import StandaloneModuleApp from '@/components/template/StandaloneModuleApp'
import ActivitiesModule from './ActivitiesModule'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <StandaloneModuleApp
            moduleTitle="Activities"
            modulePath="/activities"
            ModuleComponent={ActivitiesModule}
        />
    </React.StrictMode>,
)
