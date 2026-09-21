import React from 'react'
import ReactDOM from 'react-dom/client'
import StandaloneModuleApp from '@/components/template/StandaloneModuleApp'
import ChatModule from './ChatModule'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <StandaloneModuleApp
            moduleTitle="Chat"
            modulePath="/chat"
            ModuleComponent={ChatModule}
        />
    </React.StrictMode>,
)
