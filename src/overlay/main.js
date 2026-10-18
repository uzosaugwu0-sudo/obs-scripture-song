import { createBrowserTransport } from '../transport/index.js';
import { createRenderer } from './render.js';

const report = (err) => console.error('[overlay]', err);

const transport = createBrowserTransport('overlay', report);
const renderer  = createRenderer(document, report);
transport.subscribe((state) => renderer.handle(state));
transport.start();
