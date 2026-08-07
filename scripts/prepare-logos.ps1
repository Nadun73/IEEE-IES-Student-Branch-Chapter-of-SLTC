Add-Type -AssemblyName System.Drawing

$assetsDirectory = Join-Path $PSScriptRoot '..\src\assets'
$colorSource = Join-Path $assetsDirectory 'ies-logo-color.png'
$whiteSource = Join-Path $assetsDirectory 'ies-logo-white.png'

function Export-CroppedLogo {
    param(
        [string]$SourcePath,
        [string]$DestinationPath,
        [System.Drawing.Rectangle]$Crop
    )

    $sourceImage = [System.Drawing.Bitmap]::FromFile($SourcePath)
    try {
        $destinationImage = New-Object System.Drawing.Bitmap(
            $Crop.Width,
            $Crop.Height,
            [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
        )

        try {
            $graphics = [System.Drawing.Graphics]::FromImage($destinationImage)
            try {
                $graphics.Clear([System.Drawing.Color]::Transparent)
                $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $destinationRectangle = New-Object System.Drawing.Rectangle(0, 0, $Crop.Width, $Crop.Height)
                $graphics.DrawImage(
                    $sourceImage,
                    $destinationRectangle,
                    $Crop,
                    [System.Drawing.GraphicsUnit]::Pixel
                )
            }
            finally {
                $graphics.Dispose()
            }

            $destinationImage.Save(
                $DestinationPath,
                [System.Drawing.Imaging.ImageFormat]::Png
            )
        }
        finally {
            $destinationImage.Dispose()
        }
    }
    finally {
        $sourceImage.Dispose()
    }
}

Export-CroppedLogo `
    -SourcePath $colorSource `
    -DestinationPath (Join-Path $assetsDirectory 'ies-logo-color-web.png') `
    -Crop (New-Object System.Drawing.Rectangle(158, 300, 821, 438))

Export-CroppedLogo `
    -SourcePath $whiteSource `
    -DestinationPath (Join-Path $assetsDirectory 'ies-logo-white-web.png') `
    -Crop (New-Object System.Drawing.Rectangle(130, 321, 820, 438))

Export-CroppedLogo `
    -SourcePath $colorSource `
    -DestinationPath (Join-Path $assetsDirectory 'ies-mark-color.png') `
    -Crop (New-Object System.Drawing.Rectangle(158, 320, 339, 339))

Write-Output 'Prepared trimmed IES web logos.'
