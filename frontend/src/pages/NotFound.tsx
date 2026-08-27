import { Link } from "react-router-dom";
import { SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div
      className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 text-center"
      data-testid="pagina-404"
    >
      <SearchX className="size-14 text-muted-foreground" />
      <h1 className="font-heading text-3xl font-extrabold">404</h1>
      <p className="text-sm text-muted-foreground">
        Não encontramos esta página. Ela pode ter sido movida ou o endereço está incorreto.
      </p>
      <Link to="/" className={buttonVariants({ variant: "default" })} data-testid="link-404-inicio">
        Voltar ao início
      </Link>
    </div>
  );
}
