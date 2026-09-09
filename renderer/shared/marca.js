/* Identidade do negócio: nome e subtítulo que aparecem nos cabeçalhos e cupons.
   Fica no próprio banco (app "config", chave "marca") e é editável em
   Dados & Backup no hub. Sem nada configurado, vale "Minha Empresa". */
(function () {
  const PADRAO = { nome: 'Minha Empresa', sub: '' };
  let m = Object.assign({}, PADRAO);
  try {
    const raw = window.api && window.api.appGet('config', 'marca');
    if (raw) m = Object.assign({}, PADRAO, JSON.parse(raw));
  } catch (e) {}
  if (!m.nome) m.nome = PADRAO.nome;

  window.MARCA = m;
  window.marcaNome = () => m.nome;
  window.marcaSub = () => m.sub || '';
  window.salvarMarca = dados => {
    m = Object.assign({}, PADRAO, dados || {});
    if (!m.nome) m.nome = PADRAO.nome;
    window.MARCA = m;
    try { window.api.appSet('config', 'marca', JSON.stringify(m)); } catch (e) {}
    aplicar();
    return m;
  };

  // Preenche o que estiver marcado no HTML, para não precisar de JS em cada tela.
  function aplicar() {
    document.querySelectorAll('[data-marca-nome]').forEach(el => { el.textContent = m.nome; });
    document.querySelectorAll('[data-marca-nome-maiusculo]').forEach(el => { el.textContent = m.nome.toUpperCase(); });
    document.querySelectorAll('[data-marca-sub]').forEach(el => { el.textContent = m.sub || ''; });
    if (document.title.includes('{marca}')) document.title = document.title.replace('{marca}', m.nome);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aplicar);
  else aplicar();
})();
