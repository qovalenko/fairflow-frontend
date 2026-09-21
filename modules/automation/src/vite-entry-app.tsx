import React from 'react'
import ReactDOM from 'react-dom/client'
import StandaloneModuleApp from '@/components/template/StandaloneModuleApp'
import AutomationModule from './AutomationModule'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <StandaloneModuleApp
            moduleTitle="Automation"
            modulePath="/automation"
            ModuleComponent={AutomationModule}
        />
    </React.StrictMode>,
)
