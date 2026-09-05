import './styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App';
import { AuthProvider } from './auth/auth-context';
import { ActiveClubProvider } from './club/active-club';
import { i18n } from './i18n';
import { OfflineNotesProvider } from './offline/offline-notes';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('index.html must have a <div id="root">');
}

createRoot(container).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <AuthProvider>
        {/*
          DENTRO do `AuthProvider` (ele usa o cliente HTTP e o `isAuthenticated`
          para decidir se busca o `/me`) e ACIMA do roteador: o seletor de clube
          mora no cabeçalho do app, que não é uma rota.
        */}
        <ActiveClubProvider>
          {/*
            ⚠️ **O GATILHO DA FILA OFFLINE MORA AQUI, E NÃO NA TELA** (Tarefa
            21): quem esvazia a fila tem de continuar existindo depois que a
            pessoa sai da anotação do dia, e tem de ser UM SÓ — dois donos
            escutando `online` mandariam a mesma anotação duas vezes.

            ABAIXO do `ActiveClubProvider` porque a fila é POR PESSOA (decisão
            E): sem o `me` do `/me` ela não sabe de quem é o texto, e o autor da
            nota vem do JWT. ACIMA do roteador porque ela não é de rota nenhuma.
          */}
          <OfflineNotesProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </OfflineNotesProvider>
        </ActiveClubProvider>
      </AuthProvider>
    </I18nextProvider>
  </StrictMode>,
);
