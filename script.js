// CONFIGURAÇÃO
const firebaseConfig = {
    apiKey: "AIzaSyCijldF4haJzh0nzu4fbPYGHJadyYuqTP4",
    authDomain: "projmei.firebaseapp.com",
    projectId: "projmei",
    storageBucket: "projmei.firebasestorage.app",
    messagingSenderId: "39066795540",
    appId: "1:39066795540:web:edc72cedb442daee423101",
    measurementId: "G-PE631DFGE0"
};
const SEU_LINK_PDF = "https://drive.google.com/file/d/1gMocDMAey8q35-bcJsRip7Zm0v2mCrMS/view?usp=sharing"; 
const DEFAULT_DAS_LINK = "https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgmei.app/Identificacao";
const PIX_KEY = "b4648948-d0a8-4402-81f4-8a4047fcf4e5";

// CONSTANTES DE SEGURANÇA (LICENÇA)
const AUTH_CONST_A = 13;
const AUTH_CONST_B = 9;
const AUTH_CONST_C = 1954;
const ADMIN_EMAIL = "jcnvap@gmail.com";

class App {
    constructor() {
        this.auth = null;
        this.user = null;
        
        // Dados Locais
        this.txs = [];
        this.profile = {}; 
        this.settings = { nfLink: '', dasLink: '', merchantMode: false, irrfTable: [] }; 
        this.clients = [];
        this.suppliers = [];
        this.products = [];
        this.services = [];
        this.stockMovements = []; 

        // Controle de Licença
        this.licenseData = { expiryDate: null };
        this.randomCode = 0;

        this.isRegister = false;
        this.curType = 'income';
        this.curRegTab = 'clients'; 
        this.editIdx = null; 
        this.stockIdx = null; 
        this.stockType = 'in'; 
        this.txStockAction = 'other'; 
        this.activeRpaTxId = null;

        this.categories = {
            income: ['Venda de Produto', 'Prestação de Serviço', 'Outras Receitas'],
            expense: ['Compra de Mercadoria', 'Material de Uso', 'Aluguel', 'Água/Luz/Internet', 'Imposto (DAS)', 'Transporte', 'Retirada Pessoal', 'Outras Despesas']
        };

        // Inicializar Firebase
        this.initFirebase();
        
        // Configurar evento do formulário
        this.setupEventListeners();

        // 2. MODO DE OPERAÇÃO: Monitorar Status de Conexão (Local/Nuvem)
        window.addEventListener('online', () => this.updateConnectionStatus());
        window.addEventListener('offline', () => this.updateConnectionStatus());
    }

    setupEventListeners() {
        const authForm = document.getElementById('auth-form');
        if (authForm) {
            authForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleAuth();
            });
        }
    }

    initFirebase() {
        try {
            if (!firebaseConfig.apiKey) {
                document.getElementById('config-warning').classList.remove('hidden');
                return;
            }
            
            const app = firebase.initializeApp(firebaseConfig);
            this.auth = firebase.auth();
            
            // 2. MODO DE OPERAÇÃO: Persistência local para manter login mesmo offline/refresh
            this.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

            this.auth.onAuthStateChanged((user) => {
                if (user) {
                    this.user = user;
                    this.onLoginSuccess();
                } else {
                    this.user = null;
                    this.showAuth();
                }
                this.updateConnectionStatus();
            });
            
            console.log("Firebase inicializado.");
        } catch (error) {
            console.error("Erro ao inicializar Firebase:", error);
            document.getElementById('config-warning').classList.remove('hidden');
        }
    }

    // 2. MODO DE OPERAÇÃO: Atualiza UI baseado na conexão
    updateConnectionStatus() {
        const el = document.getElementById('connection-status');
        if (!el) return;
        
        const isOnline = navigator.onLine;
        if (isOnline) {
            el.innerHTML = '<i class="fa-solid fa-cloud"></i> Nuvem (Online)';
            el.style.color = 'var(--primary)';
        } else {
            el.innerHTML = '<i class="fa-solid fa-hdd"></i> Local (Offline)';
            el.style.color = 'var(--text-muted)';
        }
    }

    // --- AUTH ---
    async handleAuth() {
        const email = document.getElementById('auth-email').value;
        const pass = document.getElementById('auth-pass').value;
        const name = document.getElementById('auth-name').value;
        
        if (!email || !pass) {
            alert("Por favor, preencha email e senha.");
            return;
        }
        
        try {
            if (this.isRegister) {
                if(!name) {
                    alert("Digite seu nome.");
                    return;
                }
                
                console.log("Registrando usuário:", email);
                const cred = await this.auth.createUserWithEmailAndPassword(email, pass);
                
                await cred.user.updateProfile({ displayName: name });
                
                // 1. PERÍODO INICIAL: LIBERAÇÃO AUTOMÁTICA DE 90 DIAS
                const uid = cred.user.uid;
                const expiry = Date.now() + (90 * 24 * 60 * 60 * 1000); // 90 DIAS FIXO
                const newLicense = { expiryDate: expiry };
                localStorage.setItem(`mei_license_${uid}`, JSON.stringify(newLicense));
                
                this.licenseData = newLicense;
                if(this.user) this.checkLicense();
                
                alert("Conta criada! Você recebeu 90 dias de acesso gratuito.");
                
            } else {
                console.log("Fazendo login:", email);
                await this.auth.signInWithEmailAndPassword(email, pass);
            }
        } catch (e) { 
            console.error("Erro de autenticação:", e);
            alert("Erro: " + e.message); 
        }
    }

    toggleAuthMode() {
        this.isRegister = !this.isRegister;
        const regFields = document.getElementById('reg-fields');
        const btnAuth = document.getElementById('btn-auth');
        const linkToggle = document.getElementById('link-toggle');
        
        if (regFields && btnAuth && linkToggle) {
            regFields.classList.toggle('hidden');
            btnAuth.innerText = this.isRegister ? "Cadastrar" : "Entrar";
            linkToggle.innerText = this.isRegister ? "Já tenho conta" : "Criar nova conta";
        }
    }

    async recoverPassword() {
        const email = document.getElementById('auth-email').value;
        if(!email) {
            alert("Por favor, digite seu e-mail no campo acima primeiro.");
            return;
        }
        
        if(!confirm(`Enviar link de redefinição de senha para: ${email}?`)) return;

        try {
            await this.auth.sendPasswordResetEmail(email);
            alert("Email de redefinição enviado! Verifique sua caixa de entrada.");
        } catch (e) {
            alert("Erro ao enviar email: " + e.message);
        }
    }

    logout() { 
        if (this.auth) {
            this.auth.signOut();
        }
    }
    
    showAuth() {
        const authScreen = document.getElementById('auth-screen');
        const appScreen = document.getElementById('app-screen');
        
        if (authScreen) authScreen.classList.remove('hidden');
        if (appScreen) appScreen.classList.add('hidden');
    }

    // --- DATA LOAD ---
    onLoginSuccess() {
        console.log("Login bem-sucedido!");
        
        const authScreen = document.getElementById('auth-screen');
        const appScreen = document.getElementById('app-screen');
        const confEmail = document.getElementById('conf-email');
        
        if (authScreen) authScreen.classList.add('hidden');
        if (appScreen) appScreen.classList.remove('hidden');
        if (confEmail) confEmail.innerText = this.user.email;

        const uid = this.user.uid;
        const defaultIRRF = [
            { limit: 2428.80, rate: 0, ded: 0 },
            { limit: 2826.65, rate: 7.5, ded: 182.16 },
            { limit: 3751.05, rate: 15.0, ded: 394.16 },
            { limit: 4664.68, rate: 22.5, ded: 675.49 },
            { limit: 99999999, rate: 27.5, ded: 908.73 }
        ];

        const defaultSettings = JSON.stringify({ 
            nfLink: "https://www.nfse.gov.br/EmissorNacional", 
            dasLink: DEFAULT_DAS_LINK,
            merchantMode: false,
            irrfTable: defaultIRRF
        });
        
        this.settings = JSON.parse(localStorage.getItem(`mei_settings_${uid}`) || defaultSettings);
        if(!this.settings.dasLink) this.settings.dasLink = DEFAULT_DAS_LINK;
        if(!this.settings.irrfTable || this.settings.irrfTable.length === 0) this.settings.irrfTable = defaultIRRF;

        this.txs = JSON.parse(localStorage.getItem(`mei_data_${uid}`) || '[]');
        this.profile = JSON.parse(localStorage.getItem(`mei_profile_${uid}`) || '{"fantasy":"","doc":""}');
        this.clients = JSON.parse(localStorage.getItem(`mei_clients_${uid}`) || '[]');
        this.suppliers = JSON.parse(localStorage.getItem(`mei_suppliers_${uid}`) || '[]');
        this.products = JSON.parse(localStorage.getItem(`mei_products_${uid}`) || '[]');
        this.services = JSON.parse(localStorage.getItem(`mei_services_${uid}`) || '[]');
        this.stockMovements = JSON.parse(localStorage.getItem(`mei_stock_${uid}`) || '[]');
        
        this.licenseData = JSON.parse(localStorage.getItem(`mei_license_${uid}`) || '{"expiryDate":null}');

        const merchantCheckbox = document.getElementById('conf-merchant-mode');
        if (merchantCheckbox) merchantCheckbox.checked = this.settings.merchantMode || false;

        this.checkLicense();
        this.render();
        this.renderHeader();
        this.renderIRRFConfig();
        this.checkNFLink();
        this.checkDASLink();
        this.checkDASAlert();
        this.updateConnectionStatus();
        
        const adminArea = document.getElementById('admin-area');
        if (adminArea) {
            if(this.user.email === ADMIN_EMAIL) {
                adminArea.classList.remove('hidden');
            } else {
                adminArea.classList.add('hidden');
            }
        }
    }
    
    // --- LICENÇA ---
    checkLicense() {
        const now = Date.now();
        const statusEl = document.getElementById('license-status');
        const msgEl = document.getElementById('license-msg');
        const navHome = document.getElementById('nav-home');
        const navReg = document.getElementById('nav-reg');
        const navSup = document.getElementById('nav-sup');
        const navSet = document.getElementById('nav-set');
        const btnNewTx = document.getElementById('btn-new-tx');

        let daysRemaining = 0;

        if (this.licenseData.expiryDate) {
            const diff = this.licenseData.expiryDate - now;
            daysRemaining = Math.ceil(diff / (1000 * 60 * 60 * 24));
        }

        if (daysRemaining > 0) {
            if (statusEl) statusEl.innerText = `Ativo (${daysRemaining} dias restantes)`;
            if (statusEl) statusEl.style.color = 'var(--primary)';
            if (msgEl) msgEl.innerText = "Sua licença está válida.";
            
            // Unlock UI
            if (navHome) navHome.disabled = false;
            if (navReg) navReg.disabled = false;
            if (navSup) navSup.disabled = false;
            if (btnNewTx) btnNewTx.disabled = false;
        } else {
            // EXPIRED
            if (statusEl) statusEl.innerText = "EXPIRADO";
            if (statusEl) statusEl.style.color = 'var(--danger)';
            if (msgEl) msgEl.innerText = "O tempo de uso acabou. Solicite créditos para continuar.";
            
            // Lock UI & Redirect to Settings
            if (navSet) this.navTo('settings', navSet);
            if (navHome) navHome.disabled = true;
            if (navReg) navReg.disabled = true;
            if (navSup) navSup.disabled = true;
            if (btnNewTx) btnNewTx.disabled = true;
        }
    }

    openCreditModal() {
        // Gerar código aleatório
        this.randomCode = Math.floor(Math.random() * (1000 - 100 + 1)) + 100;
        const creditNum = document.getElementById('credit-random-num');
        const creditInput = document.getElementById('credit-code-input');
        const modalCredits = document.getElementById('modal-credits');
        
        if (creditNum) creditNum.innerText = this.randomCode;
        if (creditInput) creditInput.value = '';
        if (modalCredits) modalCredits.classList.remove('hidden');
    }

    // 4. BOTÃO SOLICITAR CRÉDITO: Ação do Botão
    requestWhatsAppLicense() {
        if (!this.randomCode) {
            alert("Erro: Código não gerado. Feche e abra a janela novamente.");
            return;
        }

        // Solicita quantidade de dias (Padrão 90)
        let days = prompt("Quantos dias de licença deseja solicitar?", "90");
        
        // Validação básica
        if (!days || isNaN(days) || days <= 0) {
            days = "90";
        }

        const userName = this.user.displayName || "Usuário MEI";
        const userEmail = this.user.email;
        const phone = "5534997824990";
        
        // Formata o código composto: CÓDIGO-DIAS
        const requestString = `${this.randomCode}-${days}`;

        // Mensagem formatada
        const message = `Olá, solicito liberação de créditos.%0A%0A` +
                        `*Usuário:* ${encodeURIComponent(userName)}%0A` +
                        `*Email:* ${encodeURIComponent(userEmail)}%0A` +
                        `*Código de Solicitação:* ${requestString}`;

        // Abrir WhatsApp
        window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
    }

    // 3. REGRA DA CONTRA-SENHA: Soma dos dias
    validateCreditCode() {
        const input = document.getElementById('credit-code-input');
        if (!input) return;
        
        const inputValue = input.value.trim();
        const parts = inputValue.split('-');
        
        if (parts.length !== 2) {
            alert("Formato inválido. Use: senha-dias");
            return;
        }
        
        const passInput = parseInt(parts[0]);
        const daysInput = parseInt(parts[1]);

        // 3. FÓRMULA ATUALIZADA: Considera e soma o número de dias solicitados (daysInput)
        // (Random + Days + 13) * 9 + 1954
        const expectedPass = ((this.randomCode + AUTH_CONST_A) * AUTH_CONST_B + AUTH_CONST_C + daysInput);

        if (passInput === expectedPass && daysInput > 0) {
            const now = Date.now();
            this.licenseData.expiryDate = now + (daysInput * 24 * 60 * 60 * 1000);
            localStorage.setItem(`mei_license_${this.user.uid}`, JSON.stringify(this.licenseData));
            
            alert(`Sucesso! Licença renovada por ${daysInput} dias.`);
            this.closeModal('modal-credits');
            this.checkLicense();
        } else {
            alert("Código inválido!");
        }
    }

    // Admin Functions
    adminSetDays(days) {
        if (this.user.email !== ADMIN_EMAIL) return;
        
        const now = Date.now();
        if (days === 0) {
            this.licenseData.expiryDate = now - 1000;
        } else {
            this.licenseData.expiryDate = now + (days * 24 * 60 * 60 * 1000);
        }
        
        localStorage.setItem(`mei_license_${this.user.uid}`, JSON.stringify(this.licenseData));
        this.checkLicense();
        alert(`Admin: Dias definidos para ${days}.`);
    }

    renderHeader() {
        const headName = document.getElementById('head-name');
        const headFantasy = document.getElementById('head-fantasy');
        const confNfLink = document.getElementById('conf-nf-link');
        const confDasLink = document.getElementById('conf-das-link');
        
        if (headName) headName.innerText = this.user.displayName || "Usuário";
        if (headFantasy) headFantasy.innerText = this.profile.fantasy || "Minha Empresa";
        if (confNfLink) confNfLink.value = this.settings.nfLink || '';
        if (confDasLink) confDasLink.value = this.settings.dasLink || '';
    }
    
    // --- Configuração IRRF ---
    renderIRRFConfig() {
        const tbody = document.getElementById('irrf-config-body');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        this.settings.irrfTable.forEach((row, idx) => {
            const isLast = idx === this.settings.irrfTable.length - 1;
            const limitVal = isLast ? "" : row.limit;
            const disabled = isLast ? "disabled style='background:#eee;'" : "";
            
            tbody.innerHTML += `
                <tr>
                    <td>
                        ${isLast ? 'Acima' : ''}
                        <input type="number" step="0.01" class="irrf-input" value="${limitVal}" onchange="app.updateIRRFVal(${idx}, 'limit', this.value)" ${disabled}>
                    </td>
                    <td><input type="number" step="0.1" class="irrf-input" value="${row.rate}" onchange="app.updateIRRFVal(${idx}, 'rate', this.value)"></td>
                    <td><input type="number" step="0.01" class="irrf-input" value="${row.ded}" onchange="app.updateIRRFVal(${idx}, 'ded', this.value)"></td>
                </tr>
            `;
        });
    }

    updateIRRFVal(idx, key, val) {
        if(key === 'limit' && val === "") return;
        this.settings.irrfTable[idx][key] = parseFloat(val);
    }

    saveIRRFConfig() {
        this.settings.irrfTable[this.settings.irrfTable.length-1].limit = 999999999;
        localStorage.setItem(`mei_settings_${this.user.uid}`, JSON.stringify(this.settings));
        alert("Tabela IRRF salva com sucesso!");
    }

    checkDASAlert() {
        const today = new Date().getDate();
        const el = document.getElementById('das-alert');
        if (!el) return;
        
        if (today >= 15 && today <= 19) {
            el.className = 'alert-das das-warning';
            el.innerText = '📅 Lembrete MEI: O DAS vence dia 20!';
            el.classList.remove('hidden');
        } else if (today === 20) {
            el.className = 'alert-das das-urgent';
            el.innerText = '🚨 Seu DAS vence hoje!';
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    }

    toggleMerchantMode() {
        const merchantCheckbox = document.getElementById('conf-merchant-mode');
        if (!merchantCheckbox) return;
        
        this.settings.merchantMode = merchantCheckbox.checked;
        localStorage.setItem(`mei_settings_${this.user.uid}`, JSON.stringify(this.settings));
        alert(this.settings.merchantMode ? "Modo Comerciante Ativado!" : "Modo Simples Ativado.");
    }

    setRegTab(tab) {
        this.curRegTab = tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const titles = { clients: 'Clientes', suppliers: 'Fornecedores', products: 'Produtos', services: 'Serviços' };
        const regTitle = document.getElementById('reg-title');
        if (regTitle) regTitle.innerText = titles[tab];
        
        const tabs = ['clients', 'suppliers', 'products', 'services'];
        const tabButtons = document.querySelectorAll('.tab-btn');
        if (tabButtons[tabs.indexOf(tab)]) tabButtons[tabs.indexOf(tab)].classList.add('active');

        const btnShoppingList = document.getElementById('btn-shopping-list');
        if (btnShoppingList) {
            if (tab === 'products') {
                btnShoppingList.classList.remove('hidden');
            } else {
                btnShoppingList.classList.add('hidden');
            }
        }

        this.renderRegList();
    }

    renderRegList() {
        const list = document.getElementById('reg-list');
        if (!list) return;
        
        list.innerHTML = '';
        let data = [];
        if(this.curRegTab === 'clients') data = this.clients;
        if(this.curRegTab === 'suppliers') data = this.suppliers;
        if(this.curRegTab === 'products') data = this.products;
        if(this.curRegTab === 'services') data = this.services;

        if(data.length === 0) {
            list.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px;">Nenhum item cadastrado.</p>';
            return;
        }

        data.forEach((item, idx) => {
            let subInfo = '';
            let stockBadge = '';

            if(this.curRegTab === 'products') {
                subInfo = `R$ ${parseFloat(item.price).toFixed(2)}`;
                if(item.supplier) subInfo += ` | F: ${item.supplier}`;
                
                const curr = parseInt(item.currentStock || 0);
                const min = parseInt(item.minStock || 0);
                let colorClass = 'stock-ok';
                if(curr <= min) colorClass = 'stock-crit';
                else if(curr <= min * 1.5) colorClass = 'stock-low';
                
                stockBadge = `<span class="badge-stock ${colorClass}">Est: ${curr}</span>`;
            }
            else if(this.curRegTab === 'services') subInfo = `R$ ${parseFloat(item.price).toFixed(2)}`;
            else {
                subInfo = item.phone || '';
                if(item.doc) subInfo += (subInfo ? ' | ' : '') + item.doc;
            }

            list.innerHTML += `
            <div class="tx-item">
                <div>
                    <strong>${item.name}</strong> ${stockBadge}<br>
                    <small style="color:var(--text-muted)">${subInfo}</small>
                    ${(this.curRegTab === 'clients' && item.corpName) ? `<br><small style="color:var(--text-muted); font-size:0.75rem;">${item.corpName}</small>` : ''}
                    ${(this.curRegTab === 'suppliers' && item.address) ? `<br><small style="color:var(--text-muted); font-size:0.75rem;"><i class="fa-solid fa-location-dot"></i> ${item.address}</small>` : ''}
                </div>
                <div style="display:flex; gap:8px;">
                    ${this.curRegTab === 'products' ? `<button class="btn-outline btn-sm" onclick="app.openStockModal(${idx})" title="Movimentar Estoque"><i class="fa-solid fa-box"></i></button>` : ''}
                    <button class="btn-outline btn-sm" onclick="app.openRegModal(${idx})" style="color:var(--primary);"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-outline btn-sm" onclick="app.deleteRegister(${idx})" style="color:var(--danger);"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>`;
        });
    }

    async downloadRegPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        let title = '';
        let head = [];
        let body = [];
        
        if (this.curRegTab === 'clients') {
            title = 'Lista de Clientes';
            head = [['Nome', 'Razão Social', 'Doc', 'Tel', 'Endereço']];
            body = this.clients.map(i => [i.name, i.corpName || '-', i.doc || '-', i.phone || '-', i.address || '-']);
        } else if (this.curRegTab === 'suppliers') {
            title = 'Lista de Fornecedores';
            head = [['Nome', 'Telefone', 'Documento', 'Endereço']];
            body = this.suppliers.map(i => [i.name, i.phone, i.doc, i.address || '-']);
        } else if (this.curRegTab === 'products') {
            title = 'Lista de Produtos';
            head = [['Produto', 'Preço (R$)', 'Custo (R$)', 'Estoque', 'Fornecedor']];
            body = this.products.map(i => [i.name, parseFloat(i.price).toFixed(2), parseFloat(i.cost).toFixed(2), i.currentStock, i.supplier]);
        } else if (this.curRegTab === 'services') {
            title = 'Lista de Serviços';
            head = [['Serviço', 'Preço (R$)', 'Custo (R$)']];
            body = this.services.map(i => [i.name, parseFloat(i.price).toFixed(2), parseFloat(i.cost).toFixed(2)]);
        }

        doc.text(title, 14, 10);
        doc.autoTable({
            head: head,
            body: body,
            startY: 20
        });
        
        const filename = `${this.curRegTab}_${new Date().toISOString().slice(0,10)}.pdf`;
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    openRegModal(idx = null) {
        this.editIdx = idx; 
        const regName = document.getElementById('reg-name');
        const extra = document.getElementById('reg-fields-extra');
        const modalReg = document.getElementById('modal-reg');
        
        if (!regName || !extra || !modalReg) return;
        
        regName.value = '';
        extra.innerHTML = '';
        
        const nameLabel = document.getElementById('reg-name-label');
        const regModalTitle = document.getElementById('reg-modal-title');

        let data = null;
        if (idx !== null) {
            if(this.curRegTab === 'clients') data = this.clients[idx];
            else if(this.curRegTab === 'suppliers') data = this.suppliers[idx];
            else if(this.curRegTab === 'products') data = this.products[idx];
            else data = this.services[idx];
            if (data) regName.value = data.name;
        }

        if(this.curRegTab === 'products') {
            if (regModalTitle) regModalTitle.innerText = idx !== null ? "Editar Produto" : "Novo Produto";
            if (nameLabel) nameLabel.innerText = "Nome do Produto";
            
            let supOptions = '<option value="">Sem Fornecedor</option>';
            this.suppliers.forEach(s => { supOptions += `<option value="${s.name}">${s.name}</option>`; });

            extra.innerHTML = `
                <div class="flex" style="gap:10px;">
                    <div><label class="form-label">Preço Venda</label><input type="number" id="reg-price" class="auth-input" step="0.01"></div>
                    <div><label class="form-label">Custo</label><input type="number" id="reg-cost" class="auth-input" step="0.01"></div>
                </div>
                <div class="flex" style="gap:10px;">
                    <div><label class="form-label">Est. Atual</label><input type="number" id="reg-curr-stk" class="auth-input"></div>
                    <div><label class="form-label">Est. Mínimo</label><input type="number" id="reg-min-stk" class="auth-input"></div>
                    <div><label class="form-label">Est. Ideal</label><input type="number" id="reg-ideal-stk" class="auth-input"></div>
                </div>
                <label class="form-label">Fornecedor</label>
                <select id="reg-supplier" class="auth-input">${supOptions}</select>
            `;
            if(idx !== null && data) {
                setTimeout(() => {
                    document.getElementById('reg-price').value = data.price || '';
                    document.getElementById('reg-cost').value = data.cost || '';
                    document.getElementById('reg-supplier').value = data.supplier || '';
                    document.getElementById('reg-curr-stk').value = data.currentStock || 0;
                    document.getElementById('reg-min-stk').value = data.minStock || 0;
                    document.getElementById('reg-ideal-stk').value = data.idealStock || 0;
                }, 50);
            }
        } else if(this.curRegTab === 'services') {
            if (regModalTitle) regModalTitle.innerText = idx !== null ? "Editar Serviço" : "Novo Serviço";
            if (nameLabel) nameLabel.innerText = "Nome do Serviço";
            
            extra.innerHTML = `
                <label class="form-label">Preço de Venda (R$)</label><input type="number" id="reg-price" class="auth-input" step="0.01">
                <label class="form-label">Custo (Opcional)</label><input type="number" id="reg-cost" class="auth-input" step="0.01">
            `;
            if(idx !== null && data) {
                setTimeout(() => {
                    document.getElementById('reg-price').value = data.price || '';
                    document.getElementById('reg-cost').value = data.cost || '';
                }, 50);
            }
        } else if(this.curRegTab === 'clients') {
            if (regModalTitle) regModalTitle.innerText = idx !== null ? "Editar Cliente" : "Novo Cliente";
            if (nameLabel) nameLabel.innerText = "Nome do Cliente";
            
            extra.innerHTML = `
                <label class="form-label">Razão Social (Opcional)</label><input type="text" id="reg-corp-name" class="auth-input">
                <div class="flex" style="gap:10px;">
                    <div style="flex:1"><label class="form-label">CPF / CNPJ</label><input type="text" id="reg-doc" class="auth-input"></div>
                    <div style="flex:1"><label class="form-label">Telefone</label><input type="tel" id="reg-phone" class="auth-input"></div>
                </div>
                <label class="form-label">Endereço</label><input type="text" id="reg-addr" class="auth-input">
            `;
            if(idx !== null && data) {
                setTimeout(() => {
                    document.getElementById('reg-corp-name').value = data.corpName || '';
                    document.getElementById('reg-doc').value = data.doc || '';
                    document.getElementById('reg-phone').value = data.phone || '';
                    document.getElementById('reg-addr').value = data.address || '';
                }, 50);
            }
        } else {
            if (regModalTitle) regModalTitle.innerText = "Novo Fornecedor";
            if (nameLabel) nameLabel.innerText = "Nome do Fornecedor";

            extra.innerHTML = `
                <label class="form-label">Telefone / WhatsApp</label><input type="tel" id="reg-phone" class="auth-input">
                <label class="form-label">CPF / CNPJ</label><input type="text" id="reg-doc" class="auth-input">
                <label class="form-label">Endereço</label><input type="text" id="reg-addr" class="auth-input">
            `;
            if(idx !== null && data) {
                setTimeout(() => {
                    document.getElementById('reg-phone').value = data.phone || '';
                    document.getElementById('reg-doc').value = data.doc || '';
                    document.getElementById('reg-addr').value = data.address || '';
                }, 50);
            }
        }
        modalReg.classList.remove('hidden');
    }

    saveRegister() {
        const name = document.getElementById('reg-name');
        if(!name || !name.value) {
            alert("Nome é obrigatório.");
            return;
        }

        let newItem = { name: name.value };

        if(this.curRegTab === 'products') {
            newItem.price = document.getElementById('reg-price').value || 0;
            newItem.cost = document.getElementById('reg-cost').value || 0;
            newItem.supplier = document.getElementById('reg-supplier').value || '';
            newItem.currentStock = parseInt(document.getElementById('reg-curr-stk').value || 0);
            newItem.minStock = parseInt(document.getElementById('reg-min-stk').value || 0);
            newItem.idealStock = parseInt(document.getElementById('reg-ideal-stk').value || 0);
            
            if (this.editIdx !== null) this.products[this.editIdx] = newItem;
            else this.products.push(newItem);
            localStorage.setItem(`mei_products_${this.user.uid}`, JSON.stringify(this.products));

        } else if (this.curRegTab === 'services') {
            newItem.price = document.getElementById('reg-price').value || 0;
            newItem.cost = document.getElementById('reg-cost').value || 0;
            if (this.editIdx !== null) this.services[this.editIdx] = newItem;
            else this.services.push(newItem);
            localStorage.setItem(`mei_services_${this.user.uid}`, JSON.stringify(this.services));

        } else if (this.curRegTab === 'clients') {
            newItem.corpName = document.getElementById('reg-corp-name').value || '';
            newItem.phone = document.getElementById('reg-phone').value || '';
            newItem.doc = document.getElementById('reg-doc').value || '';
            newItem.address = document.getElementById('reg-addr').value || '';
            
            if (this.editIdx !== null) this.clients[this.editIdx] = newItem;
            else this.clients.push(newItem);
            localStorage.setItem(`mei_clients_${this.user.uid}`, JSON.stringify(this.clients));

        } else {
            newItem.phone = document.getElementById('reg-phone').value || '';
            newItem.doc = document.getElementById('reg-doc').value || '';
            newItem.address = document.getElementById('reg-addr').value || '';
            if (this.editIdx !== null) this.suppliers[this.editIdx] = newItem;
            else this.suppliers.push(newItem);
            localStorage.setItem(`mei_suppliers_${this.user.uid}`, JSON.stringify(this.suppliers));
        }
        this.closeModal('modal-reg');
        this.renderRegList();
    }

    deleteRegister(idx) {
        if(!confirm("Excluir item?")) return;
        const arr = this.curRegTab === 'clients' ? this.clients : (this.curRegTab === 'suppliers' ? this.suppliers : (this.curRegTab === 'products' ? this.products : this.services));
        arr.splice(idx, 1);
        localStorage.setItem(`mei_${this.curRegTab}_${this.user.uid}`, JSON.stringify(arr));
        this.renderRegList();
    }

    openStockModal(idx) {
        this.stockIdx = idx;
        const p = this.products[idx];
        const stockProdName = document.getElementById('stock-prod-name');
        const stkQty = document.getElementById('stk-qty');
        const modalStock = document.getElementById('modal-stock');
        
        if (!stockProdName || !stkQty || !modalStock) return;
        
        stockProdName.innerText = p.name;
        stkQty.value = '';
        this.setStockType('in');
        modalStock.classList.remove('hidden');
    }

    setStockType(type) {
        this.stockType = type;
        const inc = document.getElementById('stk-inc');
        const exp = document.getElementById('stk-exp');
        const reason = document.getElementById('stk-reason');
        
        if(!inc || !exp || !reason) return;
        
        if(type === 'in') {
            inc.classList.add('active'); 
            exp.classList.remove('active');
            reason.innerHTML = '<option value="Compra">Compra</option><option value="Devolução">Devolução Cliente</option>';
        } else {
            exp.classList.add('active'); 
            inc.classList.remove('active');
            reason.innerHTML = '<option value="Venda">Venda</option><option value="Perda">Perda / Quebra</option><option value="Uso">Uso Interno</option>';
        }
    }

    saveStockMovement() {
        const qty = parseInt(document.getElementById('stk-qty').value);
        const reason = document.getElementById('stk-reason').value;
        if(!qty || qty <= 0) {
            alert("Quantidade inválida.");
            return;
        }

        const p = this.products[this.stockIdx];
        const oldStock = parseInt(p.currentStock || 0);
        
        if(this.stockType === 'in') p.currentStock = oldStock + qty;
        else p.currentStock = Math.max(0, oldStock - qty);

        this.stockMovements.push({
            date: new Date().toISOString(), 
            product: p.name, 
            type: this.stockType,
            qty: qty, 
            reason: reason, 
            newStock: p.currentStock
        });

        localStorage.setItem(`mei_products_${this.user.uid}`, JSON.stringify(this.products));
        localStorage.setItem(`mei_stock_${this.user.uid}`, JSON.stringify(this.stockMovements));
        
        alert("Estoque atualizado!");
        this.closeModal('modal-stock');
        this.renderRegList();
    }

    openShoppingList() {
        const listDiv = document.getElementById('shopping-list-content');
        const modalShopping = document.getElementById('modal-shopping');
        
        if (!listDiv || !modalShopping) return;
        
        listDiv.innerHTML = '';
        let toBuy = this.products.filter(p => (parseInt(p.currentStock||0) <= parseInt(p.minStock||0)));
        if(toBuy.length === 0) {
            listDiv.innerHTML = '<p>Tudo certo! Nenhum produto abaixo do mínimo.</p>';
        } else {
            let html = '<table style="width:100%; font-size:0.85rem; border-collapse:collapse;">';
            html += '<tr style="text-align:left; border-bottom:1px solid #ddd;"><th>Produto</th><th>Atual</th><th>Comprar</th></tr>';
            toBuy.forEach(p => {
                const ideal = parseInt(p.idealStock || 0);
                const curr = parseInt(p.currentStock || 0);
                const buyQty = ideal > curr ? (ideal - curr) : 0;
                html += `<tr><td style="padding:5px;">${p.name}<br><small style="color:var(--text-muted)">${p.supplier||''}</small></td><td style="padding:5px; color:red;">${curr}</td><td style="padding:5px; font-weight:bold;">${buyQty > 0 ? buyQty : '-'}</td></tr>`;
            });
            html += '</table>';
            listDiv.innerHTML = html;
        }
        modalShopping.classList.remove('hidden');
    }

    // --- LÓGICA DO RPA (RECIBO) ---
    openRPAModal() {
        this.activeRpaTxId = null;

        const sel = document.getElementById('rpa-client-select');
        const suppSel = document.getElementById('rpa-supplier-select');
        const modalRpa = document.getElementById('modal-rpa');
        
        if (!sel || !suppSel || !modalRpa) return;

        sel.innerHTML = '<option value="">-- Selecionar ou Digitar Manualmente --</option>';
        this.clients.forEach((c, idx) => {
            sel.innerHTML += `<option value="${idx}">${c.name}</option>`;
        });

        suppSel.innerHTML = '<option value="">-- Selecionar --</option>';
        this.suppliers.forEach((s, idx) => {
            suppSel.innerHTML += `<option value="${idx}">${s.name}</option>`;
        });
        
        // Reset fields
        document.getElementById('rpa-cli-razao').value = '';
        document.getElementById('rpa-cli-cnpj').value = '';
        document.getElementById('rpa-cli-addr').value = '';
        document.getElementById('rpa-supp-name').value = '';
        document.getElementById('rpa-supp-doc').value = '';
        document.getElementById('rpa-supp-phone').value = '';
        document.getElementById('rpa-supp-addr').value = '';
        document.getElementById('rpa-desc').value = '';
        document.getElementById('rpa-date').value = new Date().toISOString().slice(0,10);
        document.getElementById('rpa-val').value = '';
        document.getElementById('rpa-iss-pct').value = this.profile.issPct || 3;
        
        this.calcRPA();
        modalRpa.classList.remove('hidden');
    }

    fillRPAClient() {
        const idx = document.getElementById('rpa-client-select').value;
        const razao = document.getElementById('rpa-cli-razao');
        const cnpj = document.getElementById('rpa-cli-cnpj');
        const addr = document.getElementById('rpa-cli-addr');
        
        if (!razao || !cnpj || !addr) return;
        
        if(idx !== "") {
            const c = this.clients[idx];
            razao.value = c.corpName || c.name || '';
            cnpj.value = c.doc || '';
            addr.value = c.address || '';
        } else {
            razao.value = '';
            cnpj.value = '';
            addr.value = '';
        }
    }

    fillRPASupplier() {
        const idx = document.getElementById('rpa-supplier-select').value;
        const name = document.getElementById('rpa-supp-name');
        const doc = document.getElementById('rpa-supp-doc');
        const phone = document.getElementById('rpa-supp-phone');
        const addr = document.getElementById('rpa-supp-addr');
        
        if (!name || !doc || !phone || !addr) return;
        
        if(idx !== "") {
            const s = this.suppliers[idx];
            name.value = s.name || '';
            doc.value = s.doc || '';
            phone.value = s.phone || '';
            addr.value = s.address || '';
        } else {
            name.value = '';
            doc.value = '';
            phone.value = '';
            addr.value = '';
        }
    }

    calcRPA() {
        const gross = parseFloat(document.getElementById('rpa-val').value || 0);
        const issPct = parseFloat(document.getElementById('rpa-iss-pct').value || 0);
        const inssPct = 11;

        const inssVal = gross * (inssPct / 100);
        const issVal = gross * (issPct / 100);

        let baseIRRF = gross - inssVal - issVal;
        let irrfVal = 0;

        for (const row of this.settings.irrfTable) {
            if (baseIRRF <= row.limit) {
                irrfVal = (baseIRRF * (row.rate / 100)) - row.ded;
                break;
            }
        }

        if (irrfVal < 0) irrfVal = 0;

        const net = gross - inssVal - issVal - irrfVal;

        const rpaResInss = document.getElementById('rpa-res-inss');
        const rpaResIss = document.getElementById('rpa-res-iss');
        const rpaResIrrf = document.getElementById('rpa-res-irrf');
        const rpaResLiq = document.getElementById('rpa-res-liq');
        
        if (rpaResInss) rpaResInss.innerText = `R$ ${inssVal.toFixed(2)}`;
        if (rpaResIss) rpaResIss.innerText = `R$ ${issVal.toFixed(2)}`;
        if (rpaResIrrf) rpaResIrrf.innerText = `R$ ${irrfVal.toFixed(2)}`;
        if (rpaResLiq) rpaResLiq.innerText = `R$ ${net.toFixed(2)}`;
    }

    saveRPAContext() {
        if (!this.activeRpaTxId) return;

        const txIndex = this.txs.findIndex(t => t.id === this.activeRpaTxId);
        if (txIndex === -1) return;

        const rpaData = {
            clientRazao: document.getElementById('rpa-cli-razao').value,
            clientCnpj: document.getElementById('rpa-cli-cnpj').value,
            clientAddr: document.getElementById('rpa-cli-addr').value,
            suppName: document.getElementById('rpa-supp-name').value,
            suppDoc: document.getElementById('rpa-supp-doc').value,
            suppPhone: document.getElementById('rpa-supp-phone').value,
            suppAddr: document.getElementById('rpa-supp-addr').value,
            issPct: document.getElementById('rpa-iss-pct').value,
            desc: document.getElementById('rpa-desc').value,
            val: document.getElementById('rpa-val').value,
            date: document.getElementById('rpa-date').value
        };

        this.txs[txIndex].rpaData = rpaData;
        localStorage.setItem(`mei_data_${this.user.uid}`, JSON.stringify(this.txs));
    }

    async downloadRPAPDF() {
        this.saveRPAContext();

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const razaoCli = document.getElementById('rpa-cli-razao').value || "_________________";
        const cnpjCli = document.getElementById('rpa-cli-cnpj').value || "_________________";
        const endCli = document.getElementById('rpa-cli-addr').value || "_________________";
        const nomeFor = document.getElementById('rpa-supp-name').value || "_________________";
        const cpfFor = document.getElementById('rpa-supp-doc').value || "_________________";
        const endFor = document.getElementById('rpa-supp-addr').value || "_________________";
        const telFor = document.getElementById('rpa-supp-phone').value || "_________________";
        const servico = document.getElementById('rpa-desc').value || "Serviços Gerais";
        const dataServ = document.getElementById('rpa-date').value.split('-').reverse().join('/') || "__/__/____";
        const dataHoje = new Date().toLocaleDateString('pt-BR');
        const gross = parseFloat(document.getElementById('rpa-val').value || 0).toFixed(2);
        const inss = document.getElementById('rpa-res-inss').innerText;
        const iss = document.getElementById('rpa-res-iss').innerText;
        const issPct = document.getElementById('rpa-iss-pct').value;
        const irrf = document.getElementById('rpa-res-irrf').innerText;
        const liq = document.getElementById('rpa-res-liq').innerText;

        let y = 20;
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text("RECIBO DE PAGAMENTO A AUTÔNOMO – RPA", 105, y, { align: "center" });
        y += 15;

        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("1. Contratante (Empresa)", 20, y);
        y += 7;
        doc.setFont("helvetica", "normal");
        doc.text(`Razão Social: ${razaoCli}`, 20, y); y += 7;
        doc.text(`CNPJ: ${cnpjCli}`, 20, y); y += 7;
        doc.text(`Endereço: ${endCli}`, 20, y); y += 10;
        
        doc.line(20, y, 190, y); y += 10;

        doc.setFont("helvetica", "bold");
        doc.text("2. Autônomo (Prestador)", 20, y);
        y += 7;
        doc.setFont("helvetica", "normal");
        doc.text(`Nome Completo: ${nomeFor}`, 20, y); y += 7;
        doc.text(`CPF: ${cpfFor}`, 20, y); y += 7;
        doc.text(`Endereço: ${endFor}`, 20, y); y += 7;
        doc.text(`Telefone: ${telFor}`, 20, y); y += 10;

        doc.line(20, y, 190, y); y += 10;

        doc.setFont("helvetica", "bold");
        doc.text("3. Serviço Prestado", 20, y);
        y += 7;
        doc.setFont("helvetica", "normal");
        doc.text(`Descrição: ${servico}`, 20, y); y += 7;
        doc.text(`Data do Serviço: ${dataServ}`, 20, y); y += 10;

        doc.line(20, y, 190, y); y += 10;

        doc.setFont("helvetica", "bold");
        doc.text("4. Valor do Serviço", 20, y);
        y += 7;
        doc.setFont("helvetica", "normal");
        doc.text(`Valor bruto: R$ ${gross}`, 20, y); y += 10;

        doc.line(20, y, 190, y); y += 10;

        doc.setFont("helvetica", "bold");
        doc.text("5. Cálculo dos Descontos", 20, y);
        y += 7;
        doc.setFont("helvetica", "normal");
        doc.text(`a) INSS (11%): ${inss}`, 20, y); y += 7;
        doc.text(`b) ISS (${issPct}%): ${iss}`, 20, y); y += 7;
        doc.text(`c) IRRF: ${irrf}`, 20, y); y += 10;
        doc.setFont("helvetica", "bold");
        doc.text(`Valor Líquido a Receber: ${liq}`, 20, y); y += 10;

        doc.line(20, y, 190, y); y += 10;

        doc.setFont("helvetica", "bold");
        doc.text("6. Declaração", 20, y); y += 7;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        const declText = "Declaro que prestei os serviços acima descritos e recebi da contratante o valor líquido correspondente, estando o presente documento pago e quitado.";
        const splitDecl = doc.splitTextToSize(declText, 170);
        doc.text(splitDecl, 20, y);
        y += 25;

        doc.text("__________________________________________", 20, y); y += 5;
        doc.text(`${nomeFor} (Prestador)`, 20, y); y += 5;
        doc.text(`Data: ${dataHoje}`, 20, y); y += 20;

        doc.text("__________________________________________", 20, y); y += 5;
        doc.text(`${razaoCli} (Contratante)`, 20, y); y += 5;
        doc.text(`Data: ${dataHoje}`, 20, y);

        let safeRazao = razaoCli.replace(/[^a-zA-Z0-9ãõáéíóúâêîôûàçÃÕÁÉÍÓÚÂÊÎÔÛÀÇ \-_]/g, ''); 
        safeRazao = safeRazao.replace(/\s+/g, '_');
        
        const filename = `RPA_${safeRazao}_${new Date().toISOString().slice(0,10)}.pdf`;
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    downloadRPAWord() {
        this.saveRPAContext();

        const razaoCli = document.getElementById('rpa-cli-razao').value || "_________________";
        const cnpjCli = document.getElementById('rpa-cli-cnpj').value || "_________________";
        const endCli = document.getElementById('rpa-cli-addr').value || "_________________";
        const nomeFor = document.getElementById('rpa-supp-name').value || "_________________";
        const cpfFor = document.getElementById('rpa-supp-doc').value || "_________________";
        const endFor = document.getElementById('rpa-supp-addr').value || "_________________";
        const telFor = document.getElementById('rpa-supp-phone').value || "_________________";
        const servico = document.getElementById('rpa-desc').value || "Serviços Gerais";
        const dataServ = document.getElementById('rpa-date').value.split('-').reverse().join('/') || "__/__/____";
        const dataHoje = new Date().toLocaleDateString('pt-BR');
        const gross = parseFloat(document.getElementById('rpa-val').value || 0).toFixed(2);
        const inss = document.getElementById('rpa-res-inss').innerText;
        const iss = document.getElementById('rpa-res-iss').innerText;
        const issPct = document.getElementById('rpa-iss-pct').value;
        const irrf = document.getElementById('rpa-res-irrf').innerText;
        const liq = document.getElementById('rpa-res-liq').innerText;

        const content = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>RPA</title>
        <style>body{font-family:Arial, sans-serif; font-size:12pt; line-height:1.5;}</style>
        </head><body>
        <h2 style="text-align:center;">RECIBO DE PAGAMENTO A AUTÔNOMO – RPA</h2>
        <br>
        <h3>1. Contratante (Empresa)</h3>
        <p><strong>Razão Social:</strong> ${razaoCli}<br>
        <strong>CNPJ:</strong> ${cnpjCli}<br>
        <strong>Endereço:</strong> ${endCli}</p>
        <hr>
        <h3>2. Autônomo (Prestador)</h3>
        <p><strong>Nome Completo:</strong> ${nomeFor}<br>
        <strong>CPF:</strong> ${cpfFor}<br>
        <strong>Endereço:</strong> ${endFor}<br>
        <strong>Telefone:</strong> ${telFor}</p>
        <hr>
        <h3>3. Serviço Prestado</h3>
        <p><strong>Descrição do Serviço:</strong> ${servico}<br>
        <strong>Data do Serviço:</strong> ${dataServ}</p>
        <hr>
        <h3>4. Valor do Serviço</h3>
        <p><strong>Valor bruto do serviço:</strong> R$ ${gross}</p>
        <hr>
        <h3>5. Cálculo dos Descontos</h3>
        <p>a) INSS (11%): ${inss}<br>
        b) ISS (${issPct}%): ${iss}<br>
        c) IRRF: ${irrf}<br>
        <strong>➡ Valor líquido a receber: ${liq}</strong></p>
        <hr>
        <h3>6. Declaração</h3>
        <p>Declaro que prestei os serviços acima descritos e recebi da contratante o valor líquido correspondente, estando o presente documento pago e quitado.</p>
        <br>
        <p>${nomeFor}<br>__________________________________________<br>Data: ${dataHoje}</p>
        <br>
        <p>${razaoCli}<br>__________________________________________<br>Data: ${dataHoje}</p>
        </body></html>`;

        const blob = new Blob(['\ufeff', content], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `RPA_${razaoCli.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.doc`;
        a.click();
    }

    saveNFLink() {
        const nfLink = document.getElementById('conf-nf-link');
        if (!nfLink) return;
        
        this.settings.nfLink = nfLink.value;
        localStorage.setItem(`mei_settings_${this.user.uid}`, JSON.stringify(this.settings));
        alert("Link NF Salvo!");
        this.checkNFLink();
    }
    
    saveDASLink() {
        const dasLink = document.getElementById('conf-das-link');
        if (!dasLink) return;
        
        this.settings.dasLink = dasLink.value;
        localStorage.setItem(`mei_settings_${this.user.uid}`, JSON.stringify(this.settings));
        alert("Link DAS Salvo!");
        this.checkDASLink();
    }
    
    checkNFLink() {
        const el = document.getElementById('nf-shortcut');
        if (!el) return;
        
        if(this.settings.nfLink && this.settings.nfLink.length > 5) {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    }
    
    checkDASLink() {
        const el = document.getElementById('das-shortcut');
        if (!el) return;
        
        if(this.settings.dasLink && this.settings.dasLink.length > 5) {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    }

    openNFLink() { 
        if(this.settings.nfLink) window.open(this.settings.nfLink, '_blank'); 
    }
    
    openDASLink() { 
        if(this.settings.dasLink) window.open(this.settings.dasLink, '_blank'); 
    }

    downloadManual() { 
        if(!SEU_LINK_PDF) {
            alert("Configure o PDF");
            return;
        }
        window.open(SEU_LINK_PDF, '_blank'); 
    }

    openProfileModal() {
        const modalProfile = document.getElementById('modal-profile');
        if (!modalProfile) return;
        
        document.getElementById('edit-name').value = this.user.displayName || '';
        document.getElementById('edit-fantasy').value = this.profile.fantasy || '';
        document.getElementById('edit-doc').value = this.profile.doc || '';
        document.getElementById('edit-addr').value = this.profile.address || '';
        document.getElementById('edit-phone').value = this.profile.phone || '';
        document.getElementById('edit-activity').value = this.profile.activity || '';
        document.getElementById('edit-irrf').value = this.profile.irrfLimit || '2112.00';
        document.getElementById('edit-inss').value = this.profile.inssPct || '11';
        document.getElementById('edit-iss').value = this.profile.issPct || '3';

        modalProfile.classList.remove('hidden');
    }
    
    async saveProfile() {
        const newName = document.getElementById('edit-name').value;
        if(!newName) {
            alert("Nome obrigatório");
            return;
        }
        
        try {
            if(newName !== this.user.displayName) {
                await this.user.updateProfile({displayName: newName});
            }
            
            this.profile = { 
                fantasy: document.getElementById('edit-fantasy').value, 
                doc: document.getElementById('edit-doc').value,
                address: document.getElementById('edit-addr').value,
                phone: document.getElementById('edit-phone').value,
                activity: document.getElementById('edit-activity').value,
                irrfLimit: document.getElementById('edit-irrf').value || '2112.00',
                inssPct: document.getElementById('edit-inss').value || '11',
                issPct: document.getElementById('edit-iss').value || '3'
            };
            
            localStorage.setItem(`mei_profile_${this.user.uid}`, JSON.stringify(this.profile));
            alert("Atualizado!"); 
            this.closeModal('modal-profile'); 
            this.renderHeader();
        } catch(e) { 
            alert("Erro: " + e.message); 
        }
    }

    openPassModal() { 
        const modalPass = document.getElementById('modal-pass');
        if (modalPass) modalPass.classList.remove('hidden'); 
    }
    
    async changePassword() {
        const p1 = document.getElementById('new-pass').value;
        const p2 = document.getElementById('conf-pass').value;
        if(p1.length < 6 || p1!==p2) {
            alert("Senha inválida ou não confere.");
            return;
        }
        
        try { 
            await this.user.updatePassword(p1); 
            alert("Senha alterada!"); 
            this.logout(); 
        } catch(e) { 
            alert("Erro: " + e.message); 
        }
    }

    openTxModal() {
        const modalTx = document.getElementById('modal-tx');
        if (!modalTx) return;
        
        document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('tx-val').value = '';
        document.getElementById('tx-desc').value = '';
        const radios = document.getElementsByName('tx-action');
        radios.forEach(r => r.checked = (r.value === 'other'));
        this.handleStockAction('other');
        this.setType('income'); 
        modalTx.classList.remove('hidden');
    }

    setType(type) {
        this.curType = type;
        const optInc = document.getElementById('opt-inc');
        const optExp = document.getElementById('opt-exp');
        const select = document.getElementById('tx-cat');
        const merchantOpts = document.getElementById('merchant-options');
        
        if (optInc) optInc.classList.toggle('active', type === 'income');
        if (optExp) optExp.classList.toggle('active', type === 'expense');
        
        if (select) {
            select.innerHTML = '';
            this.categories[type].forEach(c => { 
                select.innerHTML += `<option value="${c}">${c}</option>`; 
            });
        }
        
        if (merchantOpts) {
            if(this.settings.merchantMode) {
                merchantOpts.classList.remove('hidden');
                const prodSel = document.getElementById('tx-prod-select');
                if (prodSel) {
                    prodSel.innerHTML = '<option value="">Selecione...</option>';
                    this.products.forEach((p, idx) => {
                        prodSel.innerHTML += `<option value="${idx}">${p.name} (R$ ${p.price})</option>`;
                    });
                }
            } else {
                merchantOpts.classList.add('hidden');
            }
        }
    }

    handleStockAction(action) {
        this.txStockAction = action;
        const details = document.getElementById('tx-prod-details');
        const valInput = document.getElementById('tx-val');
        
        if (!details || !valInput) return;

        if(action === 'sale') {
            this.setType('income'); 
            details.classList.remove('hidden');
            valInput.setAttribute('readonly', true);
            valInput.style.background = "#eee";
        } else if (action === 'buy') {
            this.setType('expense');
            details.classList.remove('hidden');
            valInput.removeAttribute('readonly');
            valInput.style.background = "#fff";
        } else {
            details.classList.add('hidden');
            valInput.removeAttribute('readonly');
            valInput.style.background = "#fff";
        }
    }

    onTxProductChange() {
        this.calcTxTotal();
    }

    calcTxTotal() {
        const idx = document.getElementById('tx-prod-select').value;
        if(idx === "") return;
        
        const qty = parseInt(document.getElementById('tx-prod-qty').value || 1);
        const prod = this.products[idx];
        
        let price = 0;
        if(this.txStockAction === 'sale') price = parseFloat(prod.price || 0);
        else price = parseFloat(prod.cost || 0);
        
        const prodPrice = document.getElementById('tx-prod-price');
        const txVal = document.getElementById('tx-val');
        
        if (prodPrice) prodPrice.value = price.toFixed(2);
        
        if(this.txStockAction === 'sale') {
            if (txVal) txVal.value = (price * qty).toFixed(2);
        } else {
            if(txVal && txVal.value === "") {
                txVal.value = (price * qty).toFixed(2);
            }
        }
    }

    saveTx() {
        const val = parseFloat(document.getElementById('tx-val').value);
        const date = document.getElementById('tx-date').value;
        const cat = document.getElementById('tx-cat').value; 
        let desc = document.getElementById('tx-desc').value;

        if (!val || !date) {
            alert("Preencha valor e data");
            return;
        }

        if(this.settings.merchantMode && this.txStockAction !== 'other') {
            const prodIdx = document.getElementById('tx-prod-select').value;
            const qty = parseInt(document.getElementById('tx-prod-qty').value);
            
            if(prodIdx === "" || !qty) {
                alert("Selecione o produto e quantidade.");
                return;
            }
            
            const p = this.products[prodIdx];
            const oldStock = parseInt(p.currentStock)||0;
            
            if(this.txStockAction === 'sale') {
                p.currentStock = Math.max(0, oldStock - qty);
                desc = `Venda: ${p.name} (x${qty}) - ${desc}`;
                this.stockMovements.push({
                    date: new Date().toISOString(), 
                    product: p.name, 
                    type: 'out',
                    qty: qty, 
                    reason: 'Venda Direta', 
                    newStock: p.currentStock
                });

            } else if (this.txStockAction === 'buy') {
                p.currentStock = oldStock + qty;
                desc = `Compra: ${p.name} (x${qty}) - ${desc}`;
                this.stockMovements.push({
                    date: new Date().toISOString(), 
                    product: p.name, 
                    type: 'in',
                    qty: qty, 
                    reason: 'Reposição', 
                    newStock: p.currentStock
                });
            }
            
            localStorage.setItem(`mei_products_${this.user.uid}`, JSON.stringify(this.products));
            localStorage.setItem(`mei_stock_${this.user.uid}`, JSON.stringify(this.stockMovements));
        }

        this.txs.push({ 
            id: Date.now(), 
            type: this.curType, 
            val, 
            date, 
            cat, 
            desc 
        });
        
        localStorage.setItem(`mei_data_${this.user.uid}`, JSON.stringify(this.txs));
        
        this.closeModal('modal-tx');
        this.render();
        if(this.curRegTab === 'products') this.renderRegList();
    }

    deleteTx(id) {
        if(!confirm("Tem certeza que deseja excluir este registro do histórico?")) return;
        const index = this.txs.findIndex(t => t.id === id);
        if (index > -1) {
            this.txs.splice(index, 1);
            localStorage.setItem(`mei_data_${this.user.uid}`, JSON.stringify(this.txs));
            this.render();
        }
    }

    render() {
        const list = document.getElementById('list-recent');
        const emptyState = document.getElementById('empty-state');
        const dashBal = document.getElementById('dash-bal');
        const dashInc = document.getElementById('dash-inc');
        const dashExp = document.getElementById('dash-exp');
        
        if (!list || !emptyState || !dashBal || !dashInc || !dashExp) return;
        
        list.innerHTML = '';
        let bal = 0, incTotal = 0, expTotal = 0;
        
        if (this.txs.length === 0) {
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
            this.txs.sort((a,b) => new Date(b.date) - new Date(a.date));
            
            this.txs.forEach(tx => {
                if(tx.type === 'income') { 
                    bal += tx.val; 
                    incTotal += tx.val; 
                } else { 
                    bal -= tx.val; 
                    expTotal += tx.val; 
                }
                
                const rpaBtn = tx.type === 'income' ? 
                    `<button class="btn-sm btn-outline" onclick="app.loadRPAFromTx(${tx.id})" style="margin-right:5px; border:none;" title="Ver/Gerar RPA"><i class="fa-solid fa-file-contract text-muted"></i></button>` : '';
                const delBtn = `<button class="btn-sm btn-outline" onclick="app.deleteTx(${tx.id})" style="border:none; color:var(--danger); margin-left: 8px;" title="Excluir"><i class="fa-solid fa-trash"></i></button>`;

                list.innerHTML += `<div class="tx-item">
                    <div><strong>${tx.cat}</strong><br><small style="color:var(--text-muted)">${new Date(tx.date).toLocaleDateString()} ${tx.desc}</small></div>
                    <div class="flex">${rpaBtn}<span class="${tx.type==='income'?'text-green':'text-red'}">${tx.type==='income'?'+':'-'} R$ ${tx.val.toFixed(2)}</span>${delBtn}</div>
                </div>`;
            });
        }
        
        dashBal.innerText = `R$ ${bal.toFixed(2)}`;
        dashInc.innerText = incTotal.toFixed(2);
        dashExp.innerText = expTotal.toFixed(2);
    }

    loadRPAFromTx(id) {
        const tx = this.txs.find(t => t.id === id);
        if(!tx) return;

        this.openRPAModal();
        this.activeRpaTxId = id;

        if (tx.rpaData) {
            document.getElementById('rpa-cli-razao').value = tx.rpaData.clientRazao || '';
            document.getElementById('rpa-cli-cnpj').value = tx.rpaData.clientCnpj || '';
            document.getElementById('rpa-cli-addr').value = tx.rpaData.clientAddr || '';
            document.getElementById('rpa-supp-name').value = tx.rpaData.suppName || '';
            document.getElementById('rpa-supp-doc').value = tx.rpaData.suppDoc || '';
            document.getElementById('rpa-supp-phone').value = tx.rpaData.suppPhone || '';
            document.getElementById('rpa-supp-addr').value = tx.rpaData.suppAddr || '';
            document.getElementById('rpa-iss-pct').value = tx.rpaData.issPct || 0;
            document.getElementById('rpa-desc').value = tx.rpaData.desc || '';
            document.getElementById('rpa-val').value = tx.rpaData.val || 0;
            document.getElementById('rpa-date').value = tx.rpaData.date || '';
        } else {
            document.getElementById('rpa-val').value = tx.val;
            document.getElementById('rpa-desc').value = tx.desc;
            document.getElementById('rpa-date').value = tx.date;
        }
        
        this.calcRPA();
    }

    generateMockData() {
        if(!confirm("Isso criará registros de teste (Clientes, Produtos, etc). Deseja continuar?")) return;
        
        const uid = this.user.uid;

        this.clients.push({
            name: "Cliente Exemplo Ltda",
            corpName: "Exemplo Comércio e Indústria",
            doc: "12.345.678/0001-90",
            phone: "(11) 98888-7777",
            address: "Rua das Flores, 123, Centro"
        });

        this.suppliers.push({
            name: "Atacadão do Bairro",
            phone: "(11) 3333-4444",
            doc: "98.765.432/0001-10",
            address: "Av. Industrial, 500"
        });

        this.products.push({
            name: "Produto de Teste A",
            price: 50.00,
            cost: 25.00,
            supplier: "Atacadão do Bairro",
            currentStock: 5,
            minStock: 10,
            idealStock: 20
        });

        this.services.push({
            name: "Manutenção Padrão",
            price: 150.00,
            cost: 10.00
        });

        localStorage.setItem(`mei_clients_${uid}`, JSON.stringify(this.clients));
        localStorage.setItem(`mei_suppliers_${uid}`, JSON.stringify(this.suppliers));
        localStorage.setItem(`mei_products_${uid}`, JSON.stringify(this.products));
        localStorage.setItem(`mei_services_${uid}`, JSON.stringify(this.services));

        alert("Dados de teste gerados com sucesso!");
        this.renderRegList();
    }

    closeModal(id) { 
        const modal = document.getElementById(id);
        if (modal) modal.classList.add('hidden'); 
    }
    
    navTo(viewId, btn) {
        if (!btn) return;
        
        ['home', 'registers', 'settings', 'support'].forEach(v => {
            const view = document.getElementById('view-'+v);
            if (view) view.classList.add('hidden');
        });
        
        const targetView = document.getElementById('view-'+viewId);
        if (targetView) targetView.classList.remove('hidden');
        
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        if(viewId === 'registers') this.renderRegList();
    }

    // --- FUNÇÕES DE PIX (COPIA E COLA) ---
    crc16(str) {
        let crc = 0xFFFF;
        for (let i = 0; i < str.length; i++) {
            crc ^= str.charCodeAt(i) << 8;
            for (let j = 0; j < 8; j++) {
                if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021;
                else crc = crc << 1;
            }
        }
        return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
    }

    generatePixPayload(amount) {
        const format = (id, val) => id + val.length.toString().padStart(2, '0') + val;
        
        const merchantInfo = format('00', 'BR.GOV.BCB.PIX') + format('01', PIX_KEY);
        
        let payload = 
            format('00', '01') +                          
            format('26', merchantInfo) +                  
            format('52', '0000') +                        
            format('53', '986');                          

        if (amount > 0) {
            payload += format('54', amount.toFixed(2));   
        }

        payload += format('58', 'BR') +                   
                   format('59', 'MEI CONTROLE') +         
                   format('60', 'BRASIL') +               
                   format('62', format('05', '***'));     

        payload += '6304'; 
        payload += this.crc16(payload); 
        return payload;
    }

    generatePixCopyPaste(amount) {
        const code = this.generatePixPayload(amount);
        this.copyToClipboard(code, `Pix Copia e Cola de R$ ${amount},00 gerado!`);
        
        const disp = document.getElementById('pix-display-area');
        if (disp) {
            disp.style.display = 'block';
            disp.innerText = code;
        }
    }

    copyPixKeyOnly() {
        this.copyToClipboard(PIX_KEY, "Chave Pix copiada! Digite o valor no seu banco.");
        const disp = document.getElementById('pix-display-area');
        if (disp) {
            disp.style.display = 'block';
            disp.innerText = PIX_KEY;
        }
    }

    copyToClipboard(text, msg) {
        navigator.clipboard.writeText(text).then(() => {
            const fb = document.getElementById('pix-feedback-msg');
            if (fb) {
                fb.innerText = "✅ " + msg;
                fb.style.display = 'block';
                setTimeout(() => fb.style.display = 'none', 5000);
            }
        }).catch(err => {
            console.error("Erro ao copiar:", err);
            alert("Erro ao copiar: " + text);
        });
    }
    
    backupData() {
        const payload = { 
            txs: this.txs, 
            profile: this.profile, 
            settings: this.settings,
            clients: this.clients, 
            suppliers: this.suppliers, 
            products: this.products,
            services: this.services, 
            stockMovements: this.stockMovements
        };
        const a = document.createElement('a');
        a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload));
        a.download = `backup_mei_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
    }

    restoreData(input) {
        const file = input.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target.result);
                if(json.txs) this.txs = json.txs; 
                if(json.profile) this.profile = json.profile;
                if(json.settings) this.settings = json.settings;
                if(json.clients) this.clients = json.clients;
                if(json.suppliers) this.suppliers = json.suppliers;
                if(json.products) this.products = json.products;
                if(json.services) this.services = json.services;
                if(json.stockMovements) this.stockMovements = json.stockMovements;

                const uid = this.user.uid;
                localStorage.setItem(`mei_data_${uid}`, JSON.stringify(this.txs));
                localStorage.setItem(`mei_profile_${uid}`, JSON.stringify(this.profile));
                localStorage.setItem(`mei_settings_${uid}`, JSON.stringify(this.settings));
                localStorage.setItem(`mei_clients_${uid}`, JSON.stringify(this.clients));
                localStorage.setItem(`mei_suppliers_${uid}`, JSON.stringify(this.suppliers));
                localStorage.setItem(`mei_products_${uid}`, JSON.stringify(this.products));
                localStorage.setItem(`mei_services_${uid}`, JSON.stringify(this.services));
                localStorage.setItem(`mei_stock_${uid}`, JSON.stringify(this.stockMovements));

                this.render(); 
                this.renderHeader(); 
                this.checkNFLink(); 
                this.checkDASLink();
                alert("Restaurado!");
            } catch(e) { 
                alert("Arquivo inválido"); 
            }
        };
        reader.readAsText(file);
    }
}

// Inicializar o app quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log("Inicializando app...");
        window.app = new App();
        console.log("App inicializado com sucesso!");
    } catch(e) {
        console.error("Erro ao iniciar APP:", e);
        alert("Erro crítico ao iniciar aplicação. Verifique o console.");
    }
});