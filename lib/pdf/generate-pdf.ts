import { renderToBuffer, Document } from '@react-pdf/renderer'
import React from 'react'
import { RoofingAgreement } from './agreement-template'
import type { AgreementProps } from './agreement-template'
import type { DocumentProps } from '@react-pdf/renderer'

export type { AgreementProps }

export async function generatePDF(props: AgreementProps): Promise<Buffer> {
  // Cast through unknown: RoofingAgreement renders a <Document> at its root,
  // so the resulting element is compatible with renderToBuffer at runtime.
  const element = React.createElement(RoofingAgreement, props) as unknown as React.ReactElement<DocumentProps>
  const buffer = await renderToBuffer(element)
  return Buffer.from(buffer)
}
