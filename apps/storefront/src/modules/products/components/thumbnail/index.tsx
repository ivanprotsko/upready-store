import { Container, clx } from "@medusajs/ui"
import Image from "next/image"
import type React from "react"

import ImageFrame from "@lib/profile/image-frame"
import { imageTreatment } from "@lib/profile"
import PlaceholderImage from "@modules/common/icons/placeholder-image"

type ThumbnailProps = {
  thumbnail?: string | null
  images?: { url?: string }[] | null
  alt?: string
  priority?: boolean
  size?: "small" | "medium" | "large" | "full" | "square"
  isFeatured?: boolean
  className?: string
  "data-testid"?: string
}

const SIZES =
  "(max-width: 576px) 280px, (max-width: 768px) 360px, (max-width: 992px) 480px, 800px"

const Thumbnail: React.FC<ThumbnailProps> = ({
  thumbnail,
  images,
  alt,
  priority,
  size = "small",
  isFeatured,
  className,
  "data-testid": dataTestid,
}) => {
  const initialImage = thumbnail || images?.[0]?.url

  // A profile that declares layout.imageTreatment owns the shape of the card image: the
  // aspect comes from the profile instead of from the fixed 9:16 / 11:18 crops below. With
  // no treatment — the `default` profile — nothing here changes and the card is byte for
  // byte what the storefront renders today.
  if (imageTreatment && initialImage) {
    return (
      <ImageFrame
        src={initialImage}
        alt={alt ?? ""}
        treatment={imageTreatment}
        secondSrc={images?.[1]?.url ?? null}
        priority={priority}
        quality={50}
        sizes={SIZES}
        data-testid={dataTestid}
        className={clx(
          "bg-ui-bg-subtle",
          {
            "w-[180px]": size === "small",
            "w-[290px]": size === "medium",
            "w-[440px]": size === "large",
            "w-full": size === "full",
          },
          className
        )}
      />
    )
  }

  return (
    <Container
      className={clx(
        "relative w-full overflow-hidden p-4 bg-ui-bg-subtle shadow-elevation-card-rest rounded-large group-hover:shadow-elevation-card-hover transition-shadow ease-in-out duration-150",
        className,
        {
          "aspect-[11/18]": isFeatured,
          "aspect-[9/16]": !isFeatured && size !== "square",
          "aspect-[1/1]": size === "square",
          "w-[180px]": size === "small",
          "w-[290px]": size === "medium",
          "w-[440px]": size === "large",
          "w-full": size === "full",
        }
      )}
      data-testid={dataTestid}
    >
      <ImageOrPlaceholder
        image={initialImage}
        alt={alt}
        priority={priority}
        size={size}
      />
    </Container>
  )
}

const ImageOrPlaceholder = ({
  image,
  alt,
  priority,
  size,
}: Pick<ThumbnailProps, "alt" | "priority" | "size"> & { image?: string }) => {
  return image ? (
    <Image
      src={image}
      alt={alt ?? ""}
      className="absolute inset-0 object-cover object-center"
      draggable={false}
      quality={50}
      priority={priority}
      sizes={SIZES}
      fill
    />
  ) : (
    <div className="w-full h-full absolute inset-0 flex items-center justify-center">
      <PlaceholderImage size={size === "small" ? 16 : 24} />
    </div>
  )
}

export default Thumbnail
