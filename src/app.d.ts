declare global {
  namespace App {
    interface Locals {
      user: { username: string } | null;
    }
    interface PageData {}
    interface Error {}
    interface Platform {}
  }
}

export {};
