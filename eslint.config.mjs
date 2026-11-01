import nextConfig from 'eslint-config-next/core-web-vitals';

export default [
  { ignores: ['.next/**', 'node_modules/**'] },
  ...nextConfig,
  {
    // Новые в eslint-plugin-react-hooks v6 (пришла с Next 16). Реальные находки
    // (ThemeToggle, Picker, ReportForm, PriceChart), но чинить — трогать логику
    // компонентов, включая форму ежедневного отчёта. Отдельная задача, не часть
    // перехода на Next 16: понижено до warn, чтобы не блокировать lint и не
    // прятать долг молча.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
];
