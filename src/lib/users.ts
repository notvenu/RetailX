export type Role = "Owner" | "Manager" | "Accountant" | "Employee";

export type MockUser = {
  id: string;
  name: string;
  email: string;
  /** Prototype only — plaintext. A real deployment stores a hash (see PRODUCT.md). */
  password: string;
  role: Role;
  title: string;
};

// ponytail: plaintext creds, single seeded org — this is a frontend prototype with mock data.
export const MOCK_USERS: MockUser[] = [
  {
    id: "u_owner",
    name: "Anand Kulkarni",
    email: "owner@retailx.test",
    password: "retailx",
    role: "Owner",
    title: "Founder & Director",
  },
  {
    id: "u_manager",
    name: "Sneha Patil",
    email: "manager@retailx.test",
    password: "retailx",
    role: "Manager",
    title: "Operations Manager",
  },
  {
    id: "u_accountant",
    name: "Rahul Joshi",
    email: "accountant@retailx.test",
    password: "retailx",
    role: "Accountant",
    title: "Accounts Lead",
  },
  {
    id: "u_employee",
    name: "Ganesh Pawar",
    email: "employee@retailx.test",
    password: "retailx",
    role: "Employee",
    title: "Store Associate — Central",
  },
];

export function verifyCredentials(email: string, password: string): MockUser | null {
  const u = MOCK_USERS.find(
    (x) => x.email.toLowerCase() === email.toLowerCase().trim(),
  );
  return u && u.password === password ? u : null;
}
