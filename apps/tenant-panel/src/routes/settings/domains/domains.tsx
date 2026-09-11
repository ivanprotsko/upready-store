import { useState } from "react"
import { Trash } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  IconButton,
  Input,
  Text,
  toast,
} from "@medusajs/ui"

import { SingleColumnPage } from "../../../components/layout/pages"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import {
  useCreateDomain,
  useDeleteDomain,
  useDomains,
} from "../../../hooks/api/domains"

// tenant-panel wave 2, piece 9 (storefront by host). The panel's own screen; the
// Admin has no counterpart, because a native Medusa install serves one
// storefront and never asks which host a request arrived on. Built from the
// same @medusajs/ui primitives the copied screens use (Container/Heading/Input/
// Button/toast), so it sits next to them without a second visual vocabulary.
//
// Two lists, deliberately unlike each other:
//   - the technical hosts are read-only. They have no database row: the backend
//     derives them from the shop's handle, which is why nobody — tenant or
//     staff — can delete the address a shop is reachable at
//     (docs/multitenancy/storefront-by-host.md §2).
//   - custom hosts are rows the shop owner adds and removes.
//
// Strings are English literals, the way every other panel-own screen writes
// them (`routes/not-built`, the `/pages` and `/home-settings` breadcrumbs in
// app.tsx): the copied i18n catalogs are the Admin's and carry no key for a
// concept the Admin does not have.

/** The one DNS instruction a shop owner needs; the proxy side is hosting-spec B4. */
const CNAME_TARGET = __CNAME_TARGET__ || "stores.upready.dev"

export const Domains = () => {
  const { domains, technical, isPending, isError, error } = useDomains()
  const [host, setHost] = useState("")

  const { mutateAsync: createDomain, isPending: isCreating } = useCreateDomain()
  const { mutateAsync: deleteDomain, isPending: isDeleting } = useDeleteDomain()

  if (isError) {
    throw error
  }

  if (isPending) {
    return <SingleColumnPageSkeleton sections={2} />
  }

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault()

    const value = host.trim()

    if (!value) {
      return
    }

    await createDomain(
      { host: value },
      {
        // The backend owns every refusal — a host another shop already holds, a
        // reserved `<handle>.<platform domain>` name, a malformed one. Its
        // message says which, and repeating a guess here would drift from it.
        onError: (err) => toast.error(err.message),
        onSuccess: () => {
          toast.success(`${value} now points at your storefront.`)
          setHost("")
        },
      }
    )
  }

  const handleDelete = async (domain: { id: string; host: string }) => {
    await deleteDomain(domain.id, {
      onError: (err) => toast.error(err.message),
      onSuccess: () => toast.success(`${domain.host} was removed.`),
    })
  }

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} hasOutlet={false}>
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Storefront addresses</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Your shop is always reachable at its built-in address. Add your own
            domain when you have one.
          </Text>
        </div>

        <div className="flex flex-col gap-y-2 px-6 py-4">
          <Text size="small" weight="plus">
            Built-in addresses
          </Text>
          <div className="flex flex-wrap items-center gap-2">
            {(technical ?? []).map((technicalHost) => (
              <Badge key={technicalHost} size="small" className="font-mono">
                {technicalHost}
              </Badge>
            ))}
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            These come with your shop and cannot be removed.
          </Text>
        </div>
      </Container>

      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Your own domains</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Point a CNAME record at{" "}
            <span className="font-mono text-ui-fg-base">{CNAME_TARGET}</span>,
            then add the domain here.
          </Text>
        </div>

        <div className="px-6 py-4">
          {(domains ?? []).length === 0 ? (
            <Text size="small" className="text-ui-fg-subtle">
              No domain of your own yet.
            </Text>
          ) : (
            <ul className="flex flex-col gap-y-2">
              {(domains ?? []).map((domain) => (
                <li
                  key={domain.id}
                  className="flex items-center justify-between gap-x-4"
                >
                  <Text size="small" family="mono">
                    {domain.host}
                  </Text>
                  <IconButton
                    size="small"
                    variant="transparent"
                    aria-label={`Remove ${domain.host}`}
                    disabled={isDeleting}
                    onClick={() => handleDelete(domain)}
                  >
                    <Trash />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form className="flex items-center gap-x-2 px-6 py-4" onSubmit={handleAdd}>
          <Input
            name="host"
            placeholder="shop.example.com"
            autoComplete="off"
            value={host}
            onChange={(event) => setHost(event.target.value)}
          />
          <Button type="submit" variant="secondary" isLoading={isCreating}>
            Add domain
          </Button>
        </form>
      </Container>
    </SingleColumnPage>
  )
}
