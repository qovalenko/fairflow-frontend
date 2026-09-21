import React from 'react'
import ReactDOM from 'react-dom/client'
import StandaloneModuleApp from '@/components/template/StandaloneModuleApp'
import StatisticsModule from './StatisticsModule'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <StandaloneModuleApp
            moduleTitle="Statistics"
            modulePath="/statistics"
            ModuleComponent={StatisticsModule}
        />
    </React.StrictMode>,
)
