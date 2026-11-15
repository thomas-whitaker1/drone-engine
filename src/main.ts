import { createApp } from './app';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('The #app mount point is missing from index.html.');

createApp({ mount: app });
