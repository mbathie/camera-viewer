# @seabin/camera-viewer (local package)

Reusable camera image viewer + server actions.

## Install (local path)

In your Next.js project `package.json`:

```json
{
  "dependencies": {
    "@seabin/camera-viewer": "file:../camera-viewer"
  }
}
```

Then `npm install`.

## Server actions

Create a file (e.g., `lib/cameraActions.js`):

```js
'use server'
import { PrismaClient } from '@prisma/client'
import { createCameraActions } from '@seabin/camera-viewer'

const prisma = new PrismaClient()

const buildUrl = (image) => {
  // Customize for your object storage
  return `https://seabin.${process.env.SPACES_REGION}.digitaloceanspaces.com/${image.path}/${image.file}`
}

export const cameraActions = createCameraActions({ prisma, buildUrl })
```

## Client page/component

```jsx
'use client'
import { CamViewer } from '@seabin/camera-viewer'
import { cameraActions } from '@/lib/cameraActions'

// pass your UI components (shadcn in this example)
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet'

export default function CameraPage(props) {
  return (
    <CamViewer
      params={props.params}
      actions={cameraActions}
      ui={{ Button, Calendar, Popover, PopoverTrigger, PopoverContent, Input, Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger }}
    />
  )
}
```

