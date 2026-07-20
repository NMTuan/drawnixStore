/** tlStore 浏览器应用入口，挂载认证与工作区界面。 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/app';
import './styles.scss';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
