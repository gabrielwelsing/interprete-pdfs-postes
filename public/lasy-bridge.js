// Lasy Console Bridge - Template para injeção no sandbox
// Este arquivo será processado pelo apply-lasy-branding.sh

(function setupLasyConsoleBridge() {
  // Evitar múltiplas inicializações
  if (window.__lasyBridgeInitialized) return;
  window.__lasyBridgeInitialized = true;

  const TARGET_ORIGIN = '*'; // Será validado no parent
  let logCounter = 0;
  let bridgeInitialized = false;

  // Função para notificar que bridge está pronto
  function notifyBridgeReady() {
    try {
      window.parent?.postMessage({ 
        __lasy: true, 
        type: 'lasy-bridge-ready' 
      }, TARGET_ORIGIN);
      console.debug('[Lasy Bridge] Ready signal sent to parent');
    } catch (error) {
      console.debug('Lasy bridge ready signal failed:', error);
    }
  }

  const publish = (evt) => {
    try {
      // Adicionar ID único e timestamp
      evt.id = 'log_' + Date.now() + '_' + (++logCounter);
      evt.timestamp = Date.now();
      
      // Sanitizar objetos grandes
      if (evt.args) {
        evt.args = evt.args.map(arg => {
          if (typeof arg === 'object' && arg !== null) {
            try {
              const str = JSON.stringify(arg);
              return str.length > 1000 ? str.substring(0, 1000) + '...[truncated]' : arg;
            } catch {
              return '[Object - could not serialize]';
            }
          }
          return arg;
        });
      }
      
      // Enviar para parent via postMessage
      window.parent?.postMessage({ 
        __lasy: true, 
        type: 'sandbox-log', 
        payload: evt 
      }, TARGET_ORIGIN);
      
    } catch (error) {
      // Falha silenciosa para não quebrar o app
      console.debug('Lasy bridge error:', error);
    }
  };

  // 1. CAPTURAR ERROS EXISTENTES
  function captureExistingErrors() {
    try {
      // ✅ NOVO: Detectar página de erro "Sandbox Not Found" (E2B 502)
      if (document.title === 'Sandbox Not Found' || 
          document.body.innerHTML.includes("wasn't found") ||
          (document.body.innerHTML.includes("The sandbox") && document.body.innerHTML.includes("wasn't found"))) {
        publish({
          source: 'sandbox-status',
          level: 'error',
          message: 'Sandbox not found - E2B returned 502',
          args: ['Sandbox expired or not found'],
          type: 'sandbox-not-found',
          errorSource: 'e2b-502'
        });
        console.warn('[Lasy Bridge] Sandbox 502 detected');
        return; // Não processar outros erros se sandbox expirou
      }
      
      // ✅ NOVO: Detectar erro de conexão na porta 3000
      if (document.title.includes('This site can\'t be reached') ||
          document.body.innerHTML.includes('ERR_CONNECTION_REFUSED') ||
          document.body.innerHTML.includes('localhost:3000') ||
          document.body.innerHTML.includes('refused to connect') ||
          document.body.innerHTML.includes('This page isn\'t working') ||
          (window.location.hostname === 'localhost' && document.body.innerHTML.includes('connection'))) {
        publish({
          source: 'connection-error',
          level: 'error',
          message: 'Projeto não conectado na porta 3000',
          args: ['Projeto não está rodando na porta 3000'],
          type: 'port-3000-not-connected',
          errorSource: 'localhost-connection'
        });
        console.warn('[Lasy Bridge] Port 3000 connection error detected');
        return;
      }
      
      // ✅ NOVO: Detectar erro de BUILD do NextJS (tela vermelha)
      if (document.body.innerHTML.includes('Application error: a client-side exception has occurred') ||
          document.body.innerHTML.includes('Unhandled Runtime Error') ||
          document.body.innerHTML.includes('Error: ') ||
          document.querySelector('[data-nextjs-toast]') ||
          document.querySelector('#__next-build-watcher') ||
          document.body.innerHTML.includes('ChunkLoadError') ||
          document.body.innerHTML.includes('SyntaxError') ||
          document.body.innerHTML.includes('Module not found') ||
          (document.body.style.backgroundColor === 'rgb(255, 85, 85)' || 
           document.body.style.backgroundColor === 'red' ||
           document.documentElement.style.backgroundColor === 'rgb(255, 85, 85)')) {
        publish({
          source: 'nextjs-build-error',
          level: 'error',
          message: 'Erro de BUILD detectado no NextJS',
          args: ['Erro na compilação/build do projeto NextJS'],
          type: 'nextjs-build-error',
          errorSource: 'nextjs-build'
        });
        console.warn('[Lasy Bridge] NextJS build error detected');
      }

      // Capturar erro atual do Next.js (apenas se não for problema de sandbox)
      const nextData = window.__NEXT_DATA__;
      if (nextData?.err) {
        publish({
          source: 'nextjs-existing',
          level: 'error',
          message: nextData.err.message,
          stack: nextData.err.stack,
          args: [nextData.err.message],
          type: 'server-error',
          errorSource: nextData.err.source || 'server'
        });
      }
      
      // Capturar problemas de performance (favicon, etc.)
      if (typeof performance !== 'undefined') {
        const faviconEntries = performance.getEntries().filter(entry => 
          entry.name.includes('favicon') || 
          entry.name.includes('ico') ||
          (entry.duration === 0 && entry.name.includes('http'))
        );
        
        faviconEntries.forEach(entry => {
          publish({
            source: 'performance-existing',
            level: entry.duration === 0 ? 'warn' : 'info',
            message: `Resource issue: ${entry.name} (duration: ${entry.duration}ms)`,
            args: [`Resource: ${entry.name}`],
            type: 'network-performance',
            url: entry.name,
            duration: entry.duration
          });
        });
      }
      
      // Capturar erros do console que já aconteceram
      if (nextData?.props?.pageProps?.statusCode) {
        const statusCode = nextData.props.pageProps.statusCode;
        if (statusCode >= 400) {
          publish({
            source: 'page-existing',
            level: statusCode >= 500 ? 'error' : 'warn',
            message: `Page error: HTTP ${statusCode}`,
            args: [`HTTP ${statusCode}`],
            type: 'page-error',
            statusCode: statusCode
          });
        }
      }
          } catch {
        // Falha silenciosa
      }
  }

  // 2. CHAIN com console.* existentes (aguardar hidratação)
  function setupConsoleInterception() {
    ['log', 'info', 'warn', 'error'].forEach((level) => {
      const existingFunction = console[level];
      
      console[level] = (...args) => {
        // Evitar capturar nossos próprios logs ou logs internos
        const firstArg = args.length > 0 ? String(args[0]) : '';
        if (firstArg.includes('Lasy bridge') || 
            firstArg.includes('Lasy Bridge') ||
            firstArg.includes('HMR') ||
            firstArg.includes('[Fast Refresh]') ||
            firstArg.includes('webpack') ||
            firstArg.includes('[Lasy')) {
          return existingFunction.apply(console, args);
        }
        
        // Nossa captura primeiro (apenas se bridge inicializado)
        if (bridgeInitialized) {
          try {
            publish({
              source: 'client-console',
              level: level,
              args: args,
              message: args.map(arg => String(arg)).join(' '),
              type: 'console-call',
              interceptedBy: 'lasy-chain'
            });
                } catch {
        // Falha silenciosa
      }
        }
        
        // Executar função existente
        return existingFunction.apply(console, args);
      };
    });
  }

  // 3. CHAIN com window.onerror
  const existingWindowOnError = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    try {
      publish({
        source: 'global-error',
        level: 'error',
        message: String(message),
        stack: error?.stack,
        url: source,
        line: lineno,
        column: colno,
        args: [String(message)],
        type: 'window-onerror',
        interceptedBy: 'lasy-chain'
      });
    } catch {
      // Falha silenciosa
    }
    
    if (existingWindowOnError) {
      return existingWindowOnError.call(window, message, source, lineno, colno, error);
    }
    return false;
  };

  // 4. Listener adicional para erros
  window.addEventListener('error', (e) => {
    try {
      publish({
        source: 'client-error',
        level: 'error',
        message: e.message,
        stack: e.error?.stack,
        url: e.filename,
        line: e.lineno,
        column: e.colno,
        args: [e.message],
        type: 'javascript-error',
        interceptedBy: 'lasy-chain'
      });
    } catch {
      // Falha silenciosa
    }
  });

  // 5. CHAIN com unhandledrejection
  const existingUnhandledRejection = window.onunhandledrejection;
  window.onunhandledrejection = (e) => {
    const reason = e.reason;
    
    try {
      publish({
        source: 'client-promise',
        level: 'error',
        message: reason?.message || String(reason),
        stack: reason?.stack,
        args: [reason?.message || String(reason)],
        type: 'promise-rejection',
        interceptedBy: 'lasy-chain'
      });
    } catch {
      // Falha silenciosa
    }
    
    if (existingUnhandledRejection) {
      return existingUnhandledRejection.call(window, e);
    }
  };

  // 6. Listener adicional para promise rejections
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    try {
      publish({
        source: 'client-promise-listener',
        level: 'error',
        message: reason?.message || String(reason),
        stack: reason?.stack,
        args: [reason?.message || String(reason)],
        type: 'promise-rejection-listener',
        interceptedBy: 'lasy-chain'
      });
    } catch {
      // Falha silenciosa
    }
  });

  // 7. Interceptar fetch
  const originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    const method = (init?.method || 'GET').toUpperCase();
    const url = typeof input === 'string' ? input : input.url;
    
    try {
      const response = await originalFetch(input, init);
      
      if (!response.ok) {
        publish({
          source: 'client-fetch',
          level: 'network',
          status: response.status,
          method: method,
          url: response.url,
          message: `${method} ${response.url} ${response.status} ${response.statusText}`,
          args: [`Network Error: ${method} ${response.url} returned ${response.status}`],
          type: 'fetch-error'
        });
      }
      
      return response;
    } catch (error) {
      publish({
        source: 'client-fetch',
        level: 'network-error',
        message: error?.message || 'Network request failed',
        stack: error?.stack,
        method: method,
        url: url,
        args: [`Network Failed: ${method} ${url} - ${error?.message}`],
        type: 'fetch-failure'
      });
      throw error;
    }
  };

  // 8. Interceptar XMLHttpRequest
  const OriginalXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function() {
    const xhr = new OriginalXHR();
    const originalOpen = xhr.open.bind(xhr);
    
    xhr.open = function(method, url, ...args) {
      this._lasy_method = method;
      this._lasy_url = url;
      return originalOpen(method, url, ...args);
    };
    
    xhr.addEventListener('error', () => {
      publish({
        source: 'client-xhr',
        level: 'network-error',
        message: 'XMLHttpRequest failed',
        method: xhr._lasy_method,
        url: xhr._lasy_url,
        args: [`XHR Failed: ${xhr._lasy_method} ${xhr._lasy_url}`],
        type: 'xhr-error'
      });
    });
    
    xhr.addEventListener('load', () => {
      if (xhr.status >= 400) {
        publish({
          source: 'client-xhr',
          level: 'network',
          status: xhr.status,
          method: xhr._lasy_method,
          url: xhr._lasy_url,
          message: `${xhr._lasy_method} ${xhr._lasy_url} ${xhr.status} ${xhr.statusText}`,
          args: [`Network Error: ${xhr._lasy_method} ${xhr._lasy_url} returned ${xhr.status}`],
          type: 'xhr-status-error'
        });
      }
    });
    
    return xhr;
  };

  // 9. Função principal de inicialização
  function initializeLasyBridge() {
    console.debug('[Lasy Bridge] Starting initialization...');
    
    // 1. Capturar erros existentes primeiro
    captureExistingErrors();
    
    // 2. Configurar interceptação de console
    setupConsoleInterception();
    
    // 3. Marcar como inicializado
    bridgeInitialized = true;
    
    // 4. Notificar que a ponte foi estabelecida
    publish({
      source: 'client-bridge',
      level: 'info',
      message: 'Lasy console logs conectado',
      args: ['Lasy console logs conectado'],
      type: 'bridge-initialized'
    });
    
    // 5. Enviar sinal de pronto para parent
    notifyBridgeReady();
    
    // 6. Enviar sinal adicional com delay para garantir que parent esteja escutando
    setTimeout(() => {
      console.log('[Lasy Bridge] Sending delayed ready signal...');
      notifyBridgeReady();
    }, 1000);
    
    console.debug('[Lasy Bridge] Initialization completed');
  }

  // Aguardar hidratação antes de inicializar
  if (document.readyState === 'loading') {
    // Aguardar DOM estar pronto
    document.addEventListener('DOMContentLoaded', () => {
      // Aguardar um pouco mais para garantir hidratação
      setTimeout(initializeLasyBridge, 250);
    });
  } else {
    // DOM já está pronto, aguardar um pouco para hidratação
    setTimeout(initializeLasyBridge, 100);
  }

  // ===== ELEMENT SELECTOR FUNCTIONALITY =====
  let elementSelectorActive = false;
  let selectorStyle = null;
  let mouseMoveHandler = null;
  let clickHandler = null;

  // Função para gerar seletor CSS único
  function generateSelector(element) {
    if (!element) return '';
    
    // Prioridade: ID > classe única > tag + posição
    if (element.id) {
      return `#${element.id}`;
    }
    
    if (element.className) {
      // Garantir que className seja tratado como string
      const classNameStr = typeof element.className === 'string' 
        ? element.className 
        : element.className.toString();
      const classes = classNameStr.split(' ').filter(c => c.trim() && !c.includes('lasy-highlight'));
      if (classes.length > 0) {
        return `.${classes.join('.')}`;
      }
    }
    
    // Fallback: tag + nth-child
    const tag = element.tagName.toLowerCase();
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(el => el.tagName === element.tagName);
      const index = siblings.indexOf(element) + 1;
      return `${tag}:nth-child(${index})`;
    }
    
    return tag;
  }

  // Ativar seletor de elementos (com verificações de segurança)
  function activateElementSelector() {
    console.log('[Lasy Element Selector] activateElementSelector() called');
    console.log('[Lasy Element Selector] Current state - elementSelectorActive:', elementSelectorActive, 'bridgeInitialized:', bridgeInitialized, 'document.readyState:', document.readyState);
    
    if (elementSelectorActive) {
      console.log('[Lasy Element Selector] Already active');
      return;
    }
    
    // Verificação básica de DOM - mais permissiva
    if (document.readyState === 'loading') {
      console.log('[Lasy Element Selector] Waiting for DOM to be ready...');
      setTimeout(activateElementSelector, 300);
      return;
    }
    
    // Verificação adicional de segurança - se bridge ainda não inicializou, aguardar mais um pouco
    if (!bridgeInitialized) {
      console.log('[Lasy Element Selector] Bridge not ready, waiting...');
      setTimeout(activateElementSelector, 200);
      return;
    }
    
    console.log('[Lasy Element Selector] Activating...');
    elementSelectorActive = true;
    
    // Criar estilos para highlight
    selectorStyle = document.createElement('style');
    selectorStyle.id = 'lasy-selector-style';
    selectorStyle.textContent = `
      .lasy-highlight {
        outline: 3px solid #3b82f6 !important;
        outline-offset: 2px !important;
        cursor: pointer !important;
        position: relative !important;
        background-color: rgba(59, 130, 246, 0.1) !important;
      }
      .lasy-highlight::before {
        content: attr(data-lasy-selector);
        position: absolute;
        top: -28px;
        left: 0;
        background: #3b82f6;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-family: 'Courier New', monospace;
        z-index: 10000;
        white-space: nowrap;
        pointer-events: none;
        max-width: 300px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: bold;
      }
      body {
        cursor: crosshair !important;
      }
    `;
    document.head.appendChild(selectorStyle);
    
    // Handler para mouseover
    mouseMoveHandler = function(e) {
      if (!elementSelectorActive) return;
      e.stopPropagation();
      
      // Remover highlights anteriores
      document.querySelectorAll('.lasy-highlight').forEach(el => {
        el.classList.remove('lasy-highlight');
        el.removeAttribute('data-lasy-selector');
      });
      
      // Skip elementos do próprio seletor
      if (e.target === selectorStyle || e.target.classList.contains('lasy-highlight')) {
        return;
      }
      
      const selector = generateSelector(e.target);
      e.target.classList.add('lasy-highlight');
      e.target.setAttribute('data-lasy-selector', selector);
    };
    
    // Handler para click
    clickHandler = function(e) {
      if (!elementSelectorActive) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      const selector = generateSelector(e.target);
      const elementInfo = {
        tag: e.target.tagName.toLowerCase(),
        text: e.target.textContent?.trim().substring(0, 50) || '',
        id: e.target.id || '',
        className: e.target.className || ''
      };
      
      console.log('[Lasy Element Selector] Element selected:', selector, elementInfo);
      
      // Enviar seleção para parent
      try {
        window.parent?.postMessage({
          __lasy: true,
          type: 'element-selected',
          payload: {
            selector: selector,
            elementInfo: elementInfo
          }
        }, TARGET_ORIGIN);
        
        console.log('[Lasy Element Selector] Selection sent to parent');
      } catch (error) {
        console.error('[Lasy Element Selector] Error sending selection:', error);
      }
      
      // Auto-desativar após seleção
      deactivateElementSelector();
    };
    
    // Registrar event listeners
    document.addEventListener('mouseover', mouseMoveHandler, true);
    document.addEventListener('click', clickHandler, true);
    
    console.log('[Lasy Element Selector] Activated');
  }

  // Desativar seletor de elementos
  function deactivateElementSelector() {
    if (!elementSelectorActive) {
      console.log('[Lasy Element Selector] Already inactive');
      return;
    }
    
    console.log('[Lasy Element Selector] Deactivating...');
    elementSelectorActive = false;
    
    // Remover event listeners
    if (mouseMoveHandler) {
      document.removeEventListener('mouseover', mouseMoveHandler, true);
      mouseMoveHandler = null;
    }
    
    if (clickHandler) {
      document.removeEventListener('click', clickHandler, true);
      clickHandler = null;
    }
    
    // Remover highlights
    document.querySelectorAll('.lasy-highlight').forEach(el => {
      el.classList.remove('lasy-highlight');
      el.removeAttribute('data-lasy-selector');
    });
    
    // Remover estilos
    if (selectorStyle) {
      selectorStyle.remove();
      selectorStyle = null;
    }
    
    console.log('[Lasy Element Selector] Deactivated');
  }

  // Escutar comandos de ativação/desativação do parent
  window.addEventListener('message', (event) => {
    console.log('[Lasy Element Selector] Received message:', event.data.type, event.data);
    
    if (event.data.type === 'lasy-element-selector') {
      const action = event.data.action;
      console.log('[Lasy Element Selector] Processing action:', action);
      
      if (action === 'activate') {
        console.log('[Lasy Element Selector] Scheduling activation with 500ms delay...');
        // Delay para garantir hidratação completa - usuário já viu a página funcionando
        setTimeout(() => {
          console.log('[Lasy Element Selector] Executing delayed activation...');
          activateElementSelector();
        }, 500);
      } else if (action === 'deactivate') {
        console.log('[Lasy Element Selector] Deactivating immediately...');
        deactivateElementSelector();
      }
    }
    
    // Responder a pedidos de status do bridge
    if (event.data.type === 'lasy-bridge-status-request') {
      console.log('[Lasy Bridge] Status requested, sending ready signal...');
      notifyBridgeReady();
    }
  });

  console.log('[Lasy Element Selector] Initialized and ready');

  // ===== URL CHANGE DETECTION + ROUTE DISCOVERY =====
  let currentUrl = window.location.href;
  let discoveredRoutes = new Set(['/']);
  let scanTimeout = null;

  function notifyUrlChange() {
    const newUrl = window.location.href;
    if (newUrl === currentUrl) return;
    
    currentUrl = newUrl;
    const pathname = window.location.pathname;
    
    // Adicionar nova rota às descobertas
    discoveredRoutes.add(pathname);
    
    // Enviar mudança de URL
    window.parent?.postMessage({
      __lasy: true,
      type: 'url-change',
      payload: {
        fullUrl: newUrl,
        pathname: pathname,
        search: window.location.search,
        hash: window.location.hash,
        discoveredRoutes: Array.from(discoveredRoutes)
      }
    }, TARGET_ORIGIN);
    
    console.log('[Lasy URL Tracker] URL changed to:', pathname);
    
    // Agendar scan de links após mudança
    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(scanPageLinks, 500);
  }

  function scanPageLinks() {
    try {
      const newRoutes = new Set();
      
      // Buscar todos os links internos na página
      document.querySelectorAll('a[href^="/"]').forEach(link => {
        const href = link.getAttribute('href');
        if (href && href !== '/' && !href.includes('#')) {
          const cleanPath = href.split('?')[0]; // Remove query params
          if (cleanPath && cleanPath.length > 1) { // Evitar paths vazios
            newRoutes.add(cleanPath);
          }
        }
      });
      
      // Verificar se encontrou novas rotas
      const hasNewRoutes = Array.from(newRoutes).some(route => !discoveredRoutes.has(route));
      
      if (hasNewRoutes) {
        // Adicionar novas rotas ao conjunto
        newRoutes.forEach(route => discoveredRoutes.add(route));
        
        // Enviar atualização de rotas descobertas
        window.parent?.postMessage({
          __lasy: true,
          type: 'routes-discovered',
          payload: {
            allRoutes: Array.from(discoveredRoutes),
            newRoutes: Array.from(newRoutes),
            source: window.location.pathname,
            scanMethod: 'dom-links'
          }
        }, TARGET_ORIGIN);
        
        console.log('[Lasy Route Discovery] Found new routes:', Array.from(newRoutes));
      }
    } catch (error) {
      console.debug('[Lasy Route Discovery] Error scanning links:', error);
    }
  }

  // Interceptar History API (navegação SPA)
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    setTimeout(notifyUrlChange, 10); // Pequeno delay para garantir que a URL foi atualizada
  };

  history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    setTimeout(notifyUrlChange, 10);
  };

  // Listener para navegação via botão voltar/avançar
  window.addEventListener('popstate', () => {
    setTimeout(notifyUrlChange, 10);
  });

  // Observer para mudanças no DOM (novos links podem aparecer)
  const routeObserver = new MutationObserver(() => {
    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(scanPageLinks, 1000); // Debounce de 1 segundo
  });

  // Iniciar observação do DOM
  if (document.body) {
    routeObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  } else {
    // Se body não existe ainda, aguardar
    document.addEventListener('DOMContentLoaded', () => {
      routeObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    });
  }

  // Função para inicializar URL tracking (aguardar bridge estar pronto)
  function initializeUrlTracking() {
    if (!bridgeInitialized) {
      setTimeout(initializeUrlTracking, 100);
      return;
    }
    
    notifyUrlChange(); // Notificar URL inicial
    scanPageLinks(); // Scan inicial de links
    console.log('[Lasy URL Tracker] Initialized and tracking URL changes');
    console.log('[Lasy Route Discovery] Initialized and scanning for routes');
  }

  // Aguardar carregamento completo da página
  setTimeout(initializeUrlTracking, 1000);

})();
