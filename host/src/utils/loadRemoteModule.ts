/* eslint-disable import/no-unresolved -- virtual modules injected by vite-plugin-federation at build time */

type RemoteLoader = () => Promise<{ default: React.ComponentType }>;

const remoteMap: Record<string, RemoteLoader> = {
    contacts: () => import('remoteContacts/ContactsModule'),
    companies: () => import('remoteCompanies/CompaniesModule'),
    deals: () => import('remoteDeals/DealsModule'),
    orders: () => import('remoteOrders/OrdersModule'),
    activities: () => import('remoteActivities/ActivitiesModule'),
    products: () => import('remoteProducts/ProductsModule'),
    reports: () => import('remoteReports/ReportsModule'),
    documents: () => import('remoteDocuments/DocumentsModule'),
    automation: () => import('remoteAutomation/AutomationModule'),
    statistics: () => import('remoteStatistics/StatisticsModule'),
    search: () => import('remoteSearch/SearchModule'),
    chat: () => import('remoteChat/ChatModule'),
};

export async function loadRemoteModule(moduleId: string) {
    const loader = remoteMap[moduleId];
    if (!loader) {
        throw new Error(`Unknown remote module: ${moduleId}`);
    }
    return loader();
}

export function lazyRemote(moduleId: string) {
    return () => loadRemoteModule(moduleId);
}
