import React from 'react'
import ReactDOM from 'react-dom/client'
import StandaloneModuleApp from '@/components/template/StandaloneModuleApp'
import DealsModule from './DealsModule'
import { qa } from './qa'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <div {...qa('deals.standalone.root')}>
            <StandaloneModuleApp
                moduleTitle="Deals"
                modulePath="/deals"
                ModuleComponent={DealsModule}
            />
        </div>
    </React.StrictMode>,
)
