// Settings are a panel tab now. Chrome's "Opções" menu still opens this page,
// which forwards there and keeps a section hash such as #fontes.
location.replace(new URL(`../dashboard/index.html${location.hash || '#settings'}`, location.href).href);
