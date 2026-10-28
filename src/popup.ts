// Code exécuté dans la petite fenêtre qui s'ouvre au clic sur l'icône
const button = document.querySelector<HTMLButtonElement>("#btn")!;

button.addEventListener("click", () => {
  alert("Bonjour depuis le popup !");
});
