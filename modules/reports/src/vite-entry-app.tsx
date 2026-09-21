import React from 'react'
import ReactDOM from 'react-dom/client'
import StandaloneModuleApp from '@/components/template/StandaloneModuleApp'
import ReportsModule from './ReportsModule'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <StandaloneModuleApp
            moduleTitle="Reports"
            modulePath="/reports"
            ModuleComponent={ReportsModule}
        />
    </React.StrictMode>,
)
