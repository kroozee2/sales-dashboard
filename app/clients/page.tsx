import { redirect } from "next/navigation";

export default function ClientsIndexPage() {
  redirect("/clients/dashboard");
}
