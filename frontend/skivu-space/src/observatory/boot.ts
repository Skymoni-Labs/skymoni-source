import './style.css';
import { ISS_MODULES, NAV_ITEMS, OVERVIEW_ID } from './data';

const app = document.getElementById('app')!;
const status = document.getElementById('compatStatus')!;
let compatible = false;
let ready = false;

function select(id: string) {
  const info = ISS_MODULES[id] || ISS_MODULES[OVERVIEW_ID];
  const fields = { moduleName: info.name, moduleEnglish: info.english,
    moduleDescription: info.description, moduleFunc: info.func,
    moduleBuilt: info.built, moduleAgency: info.agency, moduleCategory: info.category };
  Object.entries(fields).forEach(([key, value]) => {
    document.getElementById(key)!.textContent = value;
  });
  app.classList.toggle('has-selection', id !== OVERVIEW_ID);
  document.querySelectorAll<HTMLElement>('[data-module]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.module === id);
    button.setAttribute('aria-pressed', String(button.dataset.module === id));
  });
}

function fallback(message: string) {
  if (compatible) return;
  compatible = true;
  app.classList.remove('is-ready');
  app.classList.add('is-compat');
  window.dispatchEvent(new Event('skivu-scene-compat'));
  document.getElementById('loader')?.classList.add('is-complete');
  status.textContent = message;
  const nav = document.getElementById('navItems')!;
  nav.replaceChildren();
  NAV_ITEMS.forEach((id, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'nav-item'; button.dataset.module = id;
    const number = document.createElement('span'); number.className = 'nav-index';
    number.textContent = String(index + 1).padStart(2, '0');
    const copy = document.createElement('span'); copy.className = 'nav-copy';
    const title = document.createElement('strong'); title.textContent = ISS_MODULES[id].name;
    const english = document.createElement('small'); english.textContent = ISS_MODULES[id].english;
    copy.append(title, english); button.append(number, copy);
    button.addEventListener('click', () => select(id)); nav.append(button);
  });
  select(OVERVIEW_ID);
}

const retry = document.getElementById('retryScene')!;
retry.addEventListener('click', () => {
  const url = new URL(location.href); url.searchParams.delete('compat');
  location.replace(url.href);
});
window.addEventListener('skivu-scene-error', (event) => {
  fallback((event as CustomEvent<string>).detail);
});
window.addEventListener('skivu-scene-ready', () => {
  ready = true;
});

// Syntax/module/GPU failures retain the HTML structure illustration instead
// of exposing an empty black canvas. This mode is explicitly labelled 2D.
if (new URLSearchParams(location.search).get('compat') === '1') {
  fallback('已选择二维结构预览。点击模块查看资料；重新加载三维版本可移除地址中的 compat 参数。');
} else import('./main').catch(() => {
  fallback('当前浏览器暂不支持此三维视图，已提供二维结构预览。建议使用新版 Chrome 或系统浏览器打开。');
});
window.setTimeout(() => {
  if (!ready) fallback('三维视图加载较慢，先查看二维结构预览。可重新加载，或使用新版系统浏览器打开。');
}, 25000);
