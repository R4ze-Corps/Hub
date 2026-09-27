import { useState, type FormEvent } from 'react';
import { KeyRound, LaptopMinimalCheck } from 'lucide-react';
import s from '@/styles/studio.module.css';

type Props = { busy: boolean; onRedeem: (key: string) => Promise<void> };
export default function RedeemLicense({ busy, onRedeem }: Props) {
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setError('');
    try {
      await onRedeem(String(values.get('licenseKey') || '').trim());
      form.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível resgatar a licença.');
    }
  }
  return <section className={s.redeemPanel} aria-labelledby='redeem-title'>
    <div className={s.redeemHeading}><KeyRound size={22} aria-hidden='true'/><div><h2 id='redeem-title'>RESGATAR LICENÇA</h2><p>Digite sua chave para liberar o script na sua biblioteca.</p></div></div>
    <form onSubmit={submit} className={s.redeemForm}>
      <label>Chave da licença<input name='licenseKey' required maxLength={80} autoComplete='off' spellCheck={false} placeholder='Cole sua licença aqui' disabled={busy}/></label>
      <button className={s.primary} disabled={busy}><LaptopMinimalCheck size={18} aria-hidden='true'/>LIBERAR SCRIPT</button>
    </form>
    {error && <p className={s.error} role='alert'>{error}</p>}
  </section>;
}
