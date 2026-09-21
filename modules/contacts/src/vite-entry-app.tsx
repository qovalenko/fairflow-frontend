import React from 'react'
import ReactDOM from 'react-dom/client'
import StandaloneModuleApp from '@/components/template/StandaloneModuleApp'
import ContactsModule from './ContactsModule'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <StandaloneModuleApp
            moduleTitle="Contacts"
            modulePath="/contacts"
            ModuleComponent={ContactsModule}
        />
    </React.StrictMode>,
)
