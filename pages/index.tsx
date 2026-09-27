import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { getServerSession } from 'next-auth/next';
import { signOut } from 'next-auth/react';
import type { GetServerSideProps } from 'next';
import { authOptions } from '@/lib/auth';
import type { StudioData, StudioLicense } from '@/types/studio';
import s from '@/styles/studio.module.css';

type Props = { user: { id: string; name: string; role: 'owner' | 'client' } };
export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res }) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return { redirect: { destination: '/login', permanent: false } };
  return { props: { user: { id: session.user.id, name: session.user.name || 'Cliente', role: session.user.role } } };
};
const labels = { overview: 'Visão geral', licenses: 'Licenças', scripts: 'Meus scripts' };
export default function Home({ user }: Props) {
  const owner = user.role === 'owner';
  const [view, setView] = useState<keyof typeof labels>('overview');
  const [data, setData] = useState<StudioData | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<'script' | 'issue' | null>(null);
  const [selected, setSelected] = useState<StudioLicense | null>(null);
  const [notice, setNotice] = useState('');
  async function load(payload?: Record<string, unknown>) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/studio', payload ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : { cache: 'no-store' });
      if (response.status === 401) { window.location.assign('/login'); return; }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar o painel.');
      setData(result); if (payload) { setDialog(null); setSelected(null); setNotice('Alteração salva.'); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar o painel.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = Object.fromEntries(new FormData(e.currentTarget));
    await load({ ...form, action: selected ? 'activate' : dialog, ...(selected ? { id: selected._id } : {}) });
  }
  const licenses = data?.licenses || [], scripts = data?.scripts || [];
  const title = (id: string) => scripts.find(x => x._id === id)?.name || 'Script';
  const rows = licenses.filter(l => [title(l.scriptId), l.discordId, l.key].join(' ').toLowerCase().includes(query.toLowerCase()));
  const status = { active: 'Ativa', pending: 'Pendente', revoked: 'Revogada' };
  return <main className={s.desktop}><Head><title>{labels[view]} · Protocolo</title></Head>
    <div className={s.menubar}><span><b>⌘ &nbsp; Protocolo</b> &nbsp; License Studio</span><span>◈ &nbsp; Workspace privado</span></div>
    <div className={s.window}>
      <aside className={s.sidebar}><div className={s.traffic}><i/><i/><i/></div><button className={s.brand} onClick={() => setView('overview')}><span>⌘</span><div>protocolo<small>LICENSE STUDIO</small></div></button>
        <div className={s.workspace}><b>P</b><div>Meu workspace<small>{owner ? 'Proprietário' : 'Área do cliente'}</small></div></div>
        <p className={s.caption}>WORKSPACE</p><nav>{(Object.keys(labels) as (keyof typeof labels)[]).map((v, i) => <button key={v} aria-current={view === v ? 'page' : undefined} className={view === v ? s.selected : ''} onClick={() => { setView(v); setQuery(''); }}><span>{['▦', '⚿', '⌘'][i]}</span>{labels[v]}</button>)}</nav>
        <p className={s.caption}>PREFERÊNCIAS</p><Link className={s.account} href='/conta'>◎ &nbsp; Minha conta</Link>
        <div className={s.profile}><span className={s.avatar}>{user.name.slice(0, 2).toUpperCase()}</span><div><b>{user.name}</b><small>{owner ? 'Proprietário' : 'Cliente'}</small></div><button aria-label='Sair da conta' onClick={() => void signOut({ callbackUrl: '/login' }).catch(() => setError('Não foi possível sair. Tente novamente.'))}>↗</button></div>
      </aside>
      <section className={s.main}><header className={s.toolbar}><span>Workspace &nbsp; / &nbsp; <b>{labels[view]}</b></span><span className={s.connected}>● Discord conectado</span></header>
        <div className={s.content}><div className={s.heading}><div><p className={s.caption}>SEU ESPAÇO, SOB CONTROLE</p><h1>{view === 'overview' ? `Olá, ${user.name}.` : labels[view]}</h1><p>{owner ? 'Gerencie seus scripts e acompanhe suas licenças.' : 'Seus scripts e licenças, em um só lugar.'}</p></div>{owner && <button className={s.primary} disabled={busy || !data} onClick={() => setDialog(view === 'scripts' || !scripts.length ? 'script' : 'issue')}>+ {view === 'scripts' || !scripts.length ? 'Novo script' : 'Nova licença'}</button>}</div>
        {error && <div className={s.error} role='alert'>{error} <button onClick={() => void load()} disabled={busy}>Tentar novamente</button></div>}
        {notice && <p className={s.notice} role='status'>{notice}</p>}
        {view === 'overview' && <><div className={s.stats}>{[['Total de licenças', licenses.length, 'Todas as suas licenças'], ['Licenças ativas', licenses.filter(l => l.status === 'active').length, 'Liberadas para uso'], ['Aguardando ativação', licenses.filter(l => l.status === 'pending').length, 'Prontas para liberar'], ['Scripts', scripts.length, owner ? 'No seu catálogo' : 'Vinculados à sua conta']].map(([label, count, hint]) => <article key={label} className={s.card}><p>{label}<span>↗</span></p><strong>{data ? count : '—'}</strong><small>{hint}</small></article>)}</div>
        <div className={s.welcome}><div className={s.orb}>⌘</div><div><h2>{owner ? 'Seu estúdio de licenças' : 'Tudo pronto para começar'}</h2><p>{owner ? 'Cadastre um script e emita uma licença para o ID do Discord do seu cliente.' : 'As licenças emitidas para seu Discord aparecem aqui. Se ainda não recebeu a sua, entre em contato com o proprietário.'}</p></div><button className={s.secondary} onClick={() => setView('licenses')}>Ver licenças ↗</button></div></>}
        {view !== 'scripts' ? <section className={s.panel}><div className={s.panelHead}><div><h2>{view === 'overview' ? 'Licenças recentes' : 'Suas licenças'}</h2><p>{owner ? 'Emissão, liberação e controle.' : 'Acesso exclusivo às licenças da sua conta.'}</p></div><input aria-label='Buscar licenças' placeholder='Buscar licença…' value={query} onChange={e => setQuery(e.target.value)}/></div><div className={s.tableWrap}><table><thead><tr><th>Script / licença</th>{owner && <th>Discord do cliente</th>}<th>Status</th><th>Servidor</th><th>Ações</th></tr></thead><tbody>{(view === 'overview' ? rows.slice(0, 5) : rows).map(l => <tr key={l._id}><td><b>{title(l.scriptId)}</b><code>{l.key.slice(0, 15)}••••</code></td>{owner && <td>{l.discordId}</td>}<td><span className={`${s.badge} ${s[l.status]}`}>{status[l.status]}</span></td><td>{l.binding || 'Não vinculado'}</td><td><div className={s.actions}><button onClick={() => void navigator.clipboard.writeText(l.key).then(() => setNotice('Chave copiada.')).catch(() => setError('Não foi possível copiar a chave.'))}>Copiar</button>{l.status === 'pending' && <button disabled={busy} onClick={() => setSelected(l)}>Liberar</button>}{owner && l.status !== 'revoked' && <button disabled={busy} onClick={() => { if (window.confirm('Revogar esta licença?')) void load({ action: 'revoke', id: l._id }); }}>Revogar</button>}</div></td></tr>)}</tbody></table></div>{!rows.length && <div className={s.empty}><span>⚿</span><h3>{!data ? busy ? 'Carregando licenças…' : 'Dados indisponíveis' : query ? 'Nenhuma licença encontrada' : 'Nenhuma licença por aqui'}</h3><p>{!data ? 'Aguarde a conexão com seu workspace.' : query ? 'Tente outro termo na busca.' : owner ? 'Cadastre um script e emita sua primeira licença.' : 'Quando uma licença for emitida para você, ela aparecerá aqui.'}</p></div>}</section> : <div className={s.scripts}>{scripts.map(script => <article className={s.panel} key={script._id}><div className={s.scriptIcon}>⌘</div><h2>{script.name}</h2><small>Versão {script.version}</small><p>{script.description || 'Sem descrição.'}</p><span>{licenses.filter(l => l.scriptId === script._id).length} licença(s)</span></article>)}{!scripts.length && <div className={s.empty}><h3>{data ? 'Nenhum script disponível' : 'Carregando scripts…'}</h3><p>{owner ? 'Use “Novo script” para começar seu catálogo.' : 'Os scripts vinculados às suas licenças aparecerão aqui.'}</p></div>}</div>}
        <footer className={s.footer}><span>⌘ Protocolo · License Studio</span><span>{owner ? 'Workspace do proprietário' : 'Área do cliente'} · Sessão protegida</span></footer></div>
      </section>
    </div>
    {(dialog || selected) && <div className={s.overlay}><dialog ref={node => { if (node && !node.open) node.showModal(); }} onCancel={() => { setDialog(null); setSelected(null); }} className={s.modal} aria-labelledby='dialog-title'><h2 id='dialog-title'>{selected ? 'Liberar licença' : dialog === 'script' ? 'Novo script' : 'Nova licença'}</h2><form onSubmit={submit}>{selected ? <label>Servidor<input name='binding' autoFocus required maxLength={120} placeholder='Nome ou identificação do servidor'/></label> : dialog === 'script' ? <><label>Nome<input name='name' autoFocus required maxLength={120}/></label><label>Versão<input name='version' defaultValue='1.0.0' maxLength={30}/></label><label>Descrição<textarea name='description' maxLength={500}/></label></> : <><label>Script<select name='scriptId' autoFocus required>{scripts.map(script => <option key={script._id} value={script._id}>{script.name}</option>)}</select></label><label>ID do Discord do cliente<input name='discordId' required pattern='[0-9]{17,20}' maxLength={20}/></label><p>A chave será gerada e ficará disponível para esse cliente.</p></>}{error && <p role='alert' className={s.error}>{error}</p>}<div className={s.actions}><button type='button' className={s.secondary} disabled={busy} onClick={() => { setDialog(null); setSelected(null); setError(''); }}>Cancelar</button><button className={s.primary} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button></div></form></dialog></div>}
  </main>;
}
