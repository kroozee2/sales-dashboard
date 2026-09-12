import PublicPresentation from "./public-presentation";

export default async function SharedPresentationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicPresentation slug={slug} />;
}
