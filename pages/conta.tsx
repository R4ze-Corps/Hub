import type { GetServerSideProps } from 'next';
export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.setHeader('Cache-Control', 'no-store');
  return { redirect: { destination: '/', permanent: false } };
};
export default function LegacyAccount() { return null; }
